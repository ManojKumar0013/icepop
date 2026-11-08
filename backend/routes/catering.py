from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import CateringInquiry, User
from core.security import audit, client_ip, require_admin

router = APIRouter(prefix="/catering", tags=["catering"])

PACKAGES = [
    {
        "id": "starter_25",
        "name": "Celebration Box (25 Pops)",
        "box_size": 25,
        "price_paise": 175000,
        "discount_pct": 10,
        "ideal_for": "Kids' birthdays & intimate family get-togethers (10-20 guests)",
        "inclusions": ["Up to 4 custom flavours", "Insulated dry-ice box (stays frozen 4+ hours)", "Eco-friendly wooden sticks & napkins"],
    },
    {
        "id": "party_50",
        "name": "Fiesta Cooler (50 Pops)",
        "box_size": 50,
        "price_paise": 325000,
        "discount_pct": 18,
        "ideal_for": "House parties, anniversaries & kitty parties (30-50 guests)",
        "inclusions": ["Up to 6 custom flavours", "Heavy-duty thermal chill box (stays frozen 6+ hours)", "Custom flavour tags & party stand", "Free express delivery"],
        "popular": True,
    },
    {
        "id": "grand_100",
        "name": "Grand Gala Chiller (100 Pops)",
        "box_size": 100,
        "price_paise": 599900,
        "discount_pct": 25,
        "ideal_for": "Weddings, sangeets & corporate pop-up events (75-120 guests)",
        "inclusions": ["All flavours unlocked", "Deep-chill insulated cart box", "Dedicated brand display card", "Priority cold-chain delivery"],
    },
]


class FlavourSelection(BaseModel):
    name: str
    quantity: int = Field(ge=1)


class CateringInquiryIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=80)
    customer_phone: str = Field(min_length=10, max_length=15)
    customer_email: Optional[str] = Field(None, max_length=255)
    event_type: str = Field(default="Birthday Party", max_length=40)
    event_date: date
    guest_count: int = Field(ge=5, le=2000)
    box_size: int = Field(default=50, ge=10)
    flavours: List[FlavourSelection] = Field(default_factory=list)
    delivery_address: str = Field(min_length=5, max_length=300)
    notes: Optional[str] = Field(None, max_length=1000)


class CateringStatusUpdateIn(BaseModel):
    status: str = Field(pattern="^(new|contacted|quote_sent|confirmed|completed|cancelled)$")
    quote_paise: Optional[int] = Field(None, ge=0)
    deposit_paise: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=1000)


@router.get("/packages")
async def get_catering_packages():
    """Returns curated party packs and catering package deals."""
    return {"packages": PACKAGES}


@router.post("/inquiry")
async def create_catering_inquiry(body: CateringInquiryIn, db: AsyncSession = Depends(get_db)):
    """Customer submits bulk party box / catering inquiry with custom flavour breakdown."""
    # Approximate pricing estimate
    if body.box_size <= 25:
        quote = 175000
    elif body.box_size <= 50:
        quote = 325000
    elif body.box_size <= 100:
        quote = 599900
    else:
        # 55 rupees per pop for larger volumes
        quote = body.box_size * 5500

    flavours_data = [{"name": f.name, "quantity": f.quantity} for f in body.flavours]

    inquiry = CateringInquiry(
        customer_name=body.customer_name.strip(),
        customer_phone=body.customer_phone.strip(),
        customer_email=body.customer_email.strip() if body.customer_email else None,
        event_type=body.event_type.strip(),
        event_date=body.event_date,
        guest_count=body.guest_count,
        box_size=body.box_size,
        flavours_json=flavours_data,
        delivery_address=body.delivery_address.strip(),
        notes=body.notes.strip() if body.notes else None,
        status="new",
        quote_paise=quote,
    )
    db.add(inquiry)
    await db.commit()
    await db.refresh(inquiry)

    return {
        "ok": True,
        "inquiry_id": inquiry.id,
        "estimated_quote_paise": quote,
        "status": inquiry.status,
        "message": "We have received your party box inquiry! Our team will reach out via WhatsApp/Phone within 2 hours.",
    }


@router.get("/admin/inquiries")
async def list_catering_inquiries(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin view for managing all catering and party box requests."""
    stmt = select(CateringInquiry).order_by(CateringInquiry.created_at.desc())
    inquiries = (await db.execute(stmt)).scalars().all()

    return {
        "inquiries": [
            {
                "id": i.id,
                "customer_name": i.customer_name,
                "customer_phone": i.customer_phone,
                "customer_email": i.customer_email,
                "event_type": i.event_type,
                "event_date": i.event_date.isoformat(),
                "guest_count": i.guest_count,
                "box_size": i.box_size,
                "flavours": i.flavours_json or [],
                "delivery_address": i.delivery_address,
                "notes": i.notes,
                "status": i.status,
                "quote_paise": i.quote_paise,
                "deposit_paise": i.deposit_paise,
                "created_at": i.created_at.isoformat(),
            }
            for i in inquiries
        ]
    }


@router.patch("/admin/inquiries/{inquiry_id}")
async def update_catering_inquiry(
    inquiry_id: int,
    body: CateringStatusUpdateIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin updates catering status, quote amount, or deposit."""
    inquiry = (await db.execute(select(CateringInquiry).where(CateringInquiry.id == inquiry_id))).scalar_one_or_none()
    if not inquiry:
        raise HTTPException(status_code=404, detail="Catering inquiry not found")

    inquiry.status = body.status
    if body.quote_paise is not None:
        inquiry.quote_paise = body.quote_paise
    if body.deposit_paise is not None:
        inquiry.deposit_paise = body.deposit_paise
    if body.notes is not None:
        inquiry.notes = body.notes

    audit(db, admin, "update_catering_inquiry", "catering_inquiry", str(inquiry_id), {"status": body.status}, client_ip(request))
    await db.commit()
    await db.refresh(inquiry)

    return {
        "ok": True,
        "id": inquiry.id,
        "status": inquiry.status,
        "quote_paise": inquiry.quote_paise,
        "deposit_paise": inquiry.deposit_paise,
    }
