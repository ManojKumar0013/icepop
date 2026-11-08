from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import Subscription, User
from core.security import audit, client_ip, require_admin, require_user

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])

PLANS = [
    {
        "id": "weekly_mini",
        "name": "Weekly Mini Chill",
        "frequency": "weekly",
        "box_size": 6,
        "price_paise": 39900,
        "perks": ["6 freshly crafted popsicles every weekend", "Free doorstep chilled delivery", "Rotate surprise flavours weekly", "Pause or skip anytime"],
        "badge": "Best for Singles & Couples",
    },
    {
        "id": "family_pack",
        "name": "Family Chill Box",
        "frequency": "weekly",
        "box_size": 12,
        "price_paise": 69900,
        "perks": ["12 assorted artisanal popsicles", "Priority Saturday evening delivery slot", "100% natural fruit pulps", "1 Free seasonal special per month"],
        "badge": "Most Popular",
        "popular": True,
    },
    {
        "id": "monthly_club",
        "name": "Popsicle Enthusiast Monthly",
        "frequency": "monthly",
        "box_size": 24,
        "price_paise": 129900,
        "perks": ["24 popsicles delivered over 4 weeks (6/week)", "Exclusive preview of unreleased flavours", "VIP customer support line", "Flat 25% off all extra counter orders"],
        "badge": "Maximum Value",
    },
]


class SubscribeIn(BaseModel):
    plan_name: str = Field(min_length=2, max_length=80)
    frequency: str = Field(default="weekly", pattern="^(weekly|biweekly|monthly)$")
    box_size: int = Field(default=6, ge=4, le=50)
    price_paise: int = Field(ge=10000)
    preferred_day: str = Field(default="Saturday", max_length=20)
    preferred_time: str = Field(default="Evening (5-8 PM)", max_length=30)
    delivery_address: str = Field(min_length=5, max_length=300)


@router.get("/plans")
async def list_subscription_plans():
    """Returns available recurring popsicle subscription tiers."""
    return {"plans": PLANS}


@router.get("/mine")
async def get_my_subscriptions(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    """User views their active and past subscriptions."""
    stmt = select(Subscription).where(Subscription.user_id == user.id).order_by(Subscription.created_at.desc())
    subs = (await db.execute(stmt)).scalars().all()
    return {
        "subscriptions": [
            {
                "id": s.id,
                "plan_name": s.plan_name,
                "frequency": s.frequency,
                "box_size": s.box_size,
                "price_paise": s.price_paise,
                "preferred_day": s.preferred_day,
                "preferred_time": s.preferred_time,
                "delivery_address": s.delivery_address,
                "status": s.status,
                "next_delivery_date": s.next_delivery_date.isoformat() if s.next_delivery_date else None,
                "created_at": s.created_at.isoformat(),
            }
            for s in subs
        ]
    }


@router.post("")
async def create_subscription(
    body: SubscribeIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a recurring weekly or monthly popsicle club subscription."""
    # Compute first delivery date (next upcoming preferred day, ~3-7 days ahead)
    first_delivery = date.today() + timedelta(days=4)

    sub = Subscription(
        user_id=user.id,
        plan_name=body.plan_name.strip(),
        frequency=body.frequency,
        box_size=body.box_size,
        price_paise=body.price_paise,
        preferred_day=body.preferred_day.strip(),
        preferred_time=body.preferred_time.strip(),
        delivery_address=body.delivery_address.strip(),
        status="active",
        next_delivery_date=first_delivery,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)

    return {
        "ok": True,
        "subscription_id": sub.id,
        "plan_name": sub.plan_name,
        "status": sub.status,
        "next_delivery_date": sub.next_delivery_date.isoformat() if sub.next_delivery_date else None,
        "message": f"Welcome to the Popsicle Club! Your first box will arrive on {sub.next_delivery_date}.",
    }


@router.patch("/{sub_id}/pause")
async def pause_subscription(
    sub_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Temporarily pause weekly deliveries."""
    sub = (await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.user_id == user.id))).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.status = "paused"
    await db.commit()
    return {"ok": True, "id": sub.id, "status": "paused"}


@router.patch("/{sub_id}/resume")
async def resume_subscription(
    sub_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Resume paused subscription deliveries."""
    sub = (await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.user_id == user.id))).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.status = "active"
    sub.next_delivery_date = date.today() + timedelta(days=4)
    await db.commit()
    return {"ok": True, "id": sub.id, "status": "active", "next_delivery_date": sub.next_delivery_date.isoformat()}


@router.delete("/{sub_id}")
async def cancel_subscription(
    sub_id: int,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel subscription membership."""
    sub = (await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.user_id == user.id))).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.status = "cancelled"
    await db.commit()
    return {"ok": True, "id": sub.id, "status": "cancelled"}


@router.get("/admin/list")
async def list_all_subscriptions(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin view of all active club memberships."""
    stmt = select(Subscription, User).join(User, User.id == Subscription.user_id).order_by(Subscription.created_at.desc())
    rows = (await db.execute(stmt)).all()
    return {
        "subscriptions": [
            {
                "id": s.id,
                "user_name": u.name,
                "user_phone": u.phone,
                "user_email": u.email,
                "plan_name": s.plan_name,
                "frequency": s.frequency,
                "box_size": s.box_size,
                "price_paise": s.price_paise,
                "preferred_day": s.preferred_day,
                "preferred_time": s.preferred_time,
                "delivery_address": s.delivery_address,
                "status": s.status,
                "next_delivery_date": s.next_delivery_date.isoformat() if s.next_delivery_date else None,
            }
            for s, u in rows
        ]
    }
