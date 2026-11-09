import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import IST
from core.db import get_db
from core.models import (
    AuditLog, Inventory, LoyaltyStamp, NotificationOutbox, Order, OrderItem,
    OrderStatusHistory, Payment, Product, ProductVariant, Promotion, Role, User, UserRole,
)
from core.loyalty import loyalty_promo, loyalty_text
from core.notify import STATUS_LABELS, deliver_external, notify_order_event, user_lang
from core.payments import PaymentService
from core.security import audit, client_ip, require_admin
from core.store import get_settings
from routes.orders import load_history, order_out, release_order_resources

router = APIRouter(prefix="/admin", tags=["admin"])

TRANSITIONS = {
    "pending_confirmation": {"accepted", "cancelled"},
    "accepted": {"preparing", "cancelled"},
    "preparing": {"ready_for_pickup", "out_for_delivery", "cancelled"},
    "ready_for_pickup": {"delivered", "out_for_delivery", "cancelled"},
    "out_for_delivery": {"delivered"},
    "cancelled": {"refund_pending"},
    "refund_pending": {"refunded"},
    "delivered": {"refund_pending"},
}
SUCCESS_EXCLUDED = ("cancelled", "refund_pending", "refunded")


@router.get("/overview")
async def overview(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    now_ist = datetime.now(timezone.utc).astimezone(IST)
    today = now_ist.date()
    since = (now_ist - timedelta(days=185)).astimezone(timezone.utc)
    orders = (await db.execute(select(Order.status, Order.total_paise, Order.created_at)
                               .where(Order.created_at >= since))).all()
    daily, monthly = defaultdict(int), defaultdict(int)
    t = {"today_orders": 0, "today_sales_paise": 0}
    for status, total, created in orders:
        d = created.astimezone(IST)
        if d.date() == today:
            t["today_orders"] += 1
        if status in SUCCESS_EXCLUDED:
            continue
        if d.date() == today:
            t["today_sales_paise"] += total
        daily[d.date().isoformat()] += total
        monthly[d.strftime("%Y-%m")] += total
    counts = dict((await db.execute(select(Order.status, func.count(Order.id)).group_by(Order.status))).all())
    total_sales = await db.scalar(select(func.coalesce(func.sum(Order.total_paise), 0))
                                  .where(Order.status.not_in(SUCCESS_EXCLUDED)))
    best = (await db.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity).label("qty"), func.sum(OrderItem.line_total_paise))
        .join(Order, Order.id == OrderItem.order_id).where(Order.status.not_in(SUCCESS_EXCLUDED))
        .group_by(OrderItem.product_name).order_by(func.sum(OrderItem.quantity).desc()).limit(5))).all()
    days = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    months = []
    y, m = today.year, today.month
    for _ in range(6):
        months.insert(0, f"{y:04d}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)

    # Low stock alerts for parlour manager
    low_stock_rows = (await db.execute(
        select(Product.name, ProductVariant.name, Inventory.quantity, Inventory.low_stock_threshold)
        .join(ProductVariant, ProductVariant.product_id == Product.id)
        .join(Inventory, Inventory.variant_id == ProductVariant.id)
        .where(Inventory.track_stock.is_(True), Inventory.quantity <= Inventory.low_stock_threshold, ProductVariant.is_active.is_(True))
        .order_by(Inventory.quantity.asc())
        .limit(10)
    )).all()
    low_stock_items = [
        {"product_name": p_name, "variant_name": v_name, "stock": qty, "threshold": thresh}
        for p_name, v_name, qty, thresh in low_stock_rows
    ]

    return {
        **t,
        "total_sales_paise": total_sales,
        "pending_orders": counts.get("pending_confirmation", 0),
        "active_orders": sum(counts.get(s, 0) for s in ("accepted", "preparing", "ready_for_pickup", "out_for_delivery")),
        "completed_orders": counts.get("delivered", 0),
        "cancelled_orders": counts.get("cancelled", 0) + counts.get("refund_pending", 0) + counts.get("refunded", 0),
        "daily_revenue": [{"date": d, "revenue_paise": daily.get(d, 0)} for d in days],
        "monthly_revenue": [{"month": mo, "revenue_paise": monthly.get(mo, 0)} for mo in months],
        "bestsellers": [{"name": n, "quantity": int(q), "revenue_paise": int(r)} for n, q, r in best],
        "low_stock_items": low_stock_items,
    }


@router.get("/reports/sales-csv")
async def export_sales_csv(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Export all completed and active orders as a CSV report for bookkeeping/tax."""
    stmt = select(Order).where(Order.status.not_in(SUCCESS_EXCLUDED)).order_by(Order.created_at.desc())
    orders = (await db.execute(stmt)).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Order Number", "Date (IST)", "Customer Name", "Customer Phone",
        "Fulfilment", "Status", "Payment Method", "Payment Status",
        "Subtotal (Rs)", "Discount (Rs)", "Delivery Fee (Rs)", "Total (Rs)"
    ])
    for o in orders:
        created_ist = o.created_at.astimezone(IST).strftime("%Y-%m-%d %H:%M:%S")
        writer.writerow([
            o.order_number, created_ist, o.customer_name, o.customer_phone,
            o.fulfilment_type, o.status, o.payment_method, o.payment_status,
            f"{o.subtotal_paise / 100:.2f}", f"{o.discount_paise / 100:.2f}",
            f"{o.delivery_fee_paise / 100:.2f}", f"{o.total_paise / 100:.2f}"
        ])
    output.seek(0)
    filename = f"icepops_sales_{datetime.now(IST):%Y%m%d_%H%M}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/orders")
async def list_orders(status: Optional[str] = None, q: Optional[str] = None, limit: int = 100,
                      admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    stmt = select(Order).order_by(Order.created_at.desc()).limit(min(max(limit, 1), 200))
    if status == "active":
        stmt = stmt.where(Order.status.in_(["pending_confirmation", "accepted", "preparing", "ready_for_pickup", "out_for_delivery"]))
    elif status:
        stmt = stmt.where(Order.status == status)
    if q:
        like = f"%{q[:40]}%"
        stmt = stmt.where(Order.order_number.ilike(like) | Order.customer_name.ilike(like) | Order.customer_phone.ilike(like))
    return [order_out(o, admin=True) for o in (await db.execute(stmt)).scalars()]


async def _admin_order(db, number, lock=False) -> Order:
    stmt = select(Order).where(Order.order_number == number)
    if lock:
        stmt = stmt.with_for_update()
    o = (await db.execute(stmt)).scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return o


async def _payment(db, order_id) -> Optional[Payment]:
    return (await db.execute(select(Payment).where(Payment.order_id == order_id).order_by(Payment.id.desc()))).scalars().first()


@router.get("/orders/{number}")
async def admin_order(number: str, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    o = await _admin_order(db, number)
    out = order_out(o, await load_history(db, o.id), await _payment(db, o.id), admin=True)
    out["notifications"] = [{"channel": n.channel, "template": n.template, "status": n.status, "error": n.error,
                             "created_at": n.created_at.isoformat()} for n in (await db.execute(
        select(NotificationOutbox).where(NotificationOutbox.order_number == number).order_by(NotificationOutbox.id))).scalars()]
    allowed = TRANSITIONS.get(o.status, set())
    if o.payment_status != "paid":
        allowed = allowed - {"refund_pending"}
    out["allowed_transitions"] = sorted(allowed)
    return out


class StatusIn(BaseModel):
    status: str = Field(max_length=30)
    note: Optional[str] = Field(None, max_length=300)


@router.post("/orders/{number}/status")
async def update_status(number: str, body: StatusIn, request: Request, background: BackgroundTasks,
                        admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    o = await _admin_order(db, number, lock=True)
    target = body.status
    if target not in TRANSITIONS.get(o.status, set()):
        raise HTTPException(status_code=400, detail=f"Can't move an order from '{STATUS_LABELS[o.status]}' to '{STATUS_LABELS.get(target, target)}'.")
    if target == "out_for_delivery" and o.fulfilment_type != "delivery":
        raise HTTPException(status_code=400, detail="This is a pickup order.")
    if target == "ready_for_pickup" and o.fulfilment_type != "pickup":
        raise HTTPException(status_code=400, detail="This is a delivery order.")
    if target == "cancelled" and not (body.note and body.note.strip()):
        raise HTTPException(status_code=400, detail="Please enter a reason for cancelling or rejecting this order.")
    if target == "refund_pending" and o.payment_status != "paid":
        raise HTTPException(status_code=400, detail="Refunds are only possible for orders with a recorded payment.")
    previous = o.status
    o.status = target
    payment = await _payment(db, o.id)
    if target == "cancelled":
        o.cancel_reason = body.note.strip()
        await release_order_resources(db, o, admin.id)
        if o.payment_status == "pending" and payment:
            payment.status = o.payment_status = "cancelled"
    if target == "refunded" and payment:
        payment.status = o.payment_status = "refunded"
    db.add(OrderStatusHistory(order_id=o.id, from_status=previous, to_status=target, note=body.note, actor_user_id=admin.id))
    event, extra = target, ""
    if target in ("cancelled", "refund_pending"):
        if target == "refund_pending":
            o.status = previous
        if await PaymentService.refund_online(o, payment, admin.id, db):
            event = "refund_pending"
        else:
            o.status = target
        stamp = (await db.execute(select(LoyaltyStamp).where(LoyaltyStamp.order_id == o.id))).scalar_one_or_none()
        if stamp:
            stamp.status = "void"
    if target == "delivered":
        lp = await loyalty_promo(db)
        if lp and lp.is_enabled and not (await db.execute(select(LoyaltyStamp.id).where(LoyaltyStamp.order_id == o.id))).first():
            db.add(LoyaltyStamp(user_id=o.user_id, order_id=o.id))
            await db.flush()
            extra = await loyalty_text(db, o.user_id, await user_lang(db, o.user_id))
    audit(db, admin, "order_status_changed", "order", o.order_number, {"from": previous, "to": o.status, "note": body.note}, client_ip(request))
    await notify_order_event(db, o, event, extra)
    await db.commit()
    background.add_task(deliver_external, o.id, event)
    return await admin_order(number, admin, db)


class PaymentIn(BaseModel):
    action: Literal["mark_collected"]
    note: Optional[str] = Field(None, max_length=200)


@router.post("/orders/{number}/payment")
async def record_payment(number: str, body: PaymentIn, request: Request, background: BackgroundTasks,
                         admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    o = await _admin_order(db, number, lock=True)
    payment = await _payment(db, o.id)
    if not payment or payment.provider != "offline":
        raise HTTPException(status_code=400, detail="Only cash/UPI-at-shop payments can be recorded manually.")
    if payment.status != "pending" or o.status in SUCCESS_EXCLUDED:
        raise HTTPException(status_code=400, detail="Payment can't be recorded for this order.")
    PaymentService.record_offline_collection(payment, admin.id, body.note)
    o.payment_status = "paid"
    audit(db, admin, "payment_collected", "order", o.order_number, {"amount_paise": payment.amount_paise, "note": body.note}, client_ip(request))
    await notify_order_event(db, o, "payment_paid")
    await db.commit()
    background.add_task(deliver_external, o.id, "payment_paid")
    return await admin_order(number, admin, db)


@router.get("/promotions")
async def promotions(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    s = await get_settings(db)
    rows = (await db.execute(select(Promotion).order_by(Promotion.id))).scalars()
    return {"allow_offer_stacking": s.allow_offer_stacking,
            "promotions": [{"code": p.code, "name": p.name, "description": p.description, "is_enabled": p.is_enabled,
                            "config": p.config} for p in rows]}


class PromotionIn(BaseModel):
    is_enabled: Optional[bool] = None
    name: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=400)
    weekdays: Optional[list[int]] = Field(None, max_length=7)
    buy: Optional[int] = Field(None, ge=1, le=10)
    free: Optional[int] = Field(None, ge=1, le=5)
    min_order_paise: Optional[int] = Field(None, ge=0, le=10_000_000)
    threshold_paise: Optional[int] = Field(None, ge=0, le=10_000_000)
    pack_size: Optional[int] = Field(None, ge=2, le=20)
    pack_price_paise: Optional[int] = Field(None, ge=100, le=10_000_000)
    stamps_needed: Optional[int] = Field(None, ge=2, le=50)
    product_ids: Optional[list[int]] = Field(None, max_length=200)


CONFIG_KEYS = {"wednesday_bogo": ("weekdays", "buy", "free"), "first_order": ("min_order_paise",), "free_delivery": ("threshold_paise",), "family_pack": ("pack_size", "pack_price_paise"), "loyalty": ("stamps_needed", "product_ids")}


@router.patch("/promotions/{code}")
async def update_promotion(code: str, body: PromotionIn, request: Request, admin: User = Depends(require_admin),
                           db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Promotion).where(Promotion.code == code))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Promotion not found")
    if body.weekdays is not None and any(d < 0 or d > 6 for d in body.weekdays):
        raise HTTPException(status_code=400, detail="Weekdays must be between 0 (Mon) and 6 (Sun).")
    before = {"is_enabled": p.is_enabled, "config": p.config}
    for k in ("is_enabled", "name", "description"):
        if getattr(body, k) is not None:
            setattr(p, k, getattr(body, k))
    cfg = dict(p.config or {})
    for k in CONFIG_KEYS.get(code, ()):
        if getattr(body, k) is not None:
            cfg[k] = sorted(set(getattr(body, k))) if k == "weekdays" else getattr(body, k)
    p.config = cfg
    audit(db, admin, "promotion_updated", "promotion", code, {"before": before, "after": {"is_enabled": p.is_enabled, "config": cfg}}, client_ip(request))
    await db.commit()
    return {"code": p.code, "name": p.name, "description": p.description, "is_enabled": p.is_enabled, "config": p.config}


class StackingIn(BaseModel):
    allow_offer_stacking: bool


@router.patch("/offer-stacking")
async def update_stacking(body: StackingIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    s = await get_settings(db)
    audit(db, admin, "offer_stacking_changed", "settings", 1, {"from": s.allow_offer_stacking, "to": body.allow_offer_stacking}, client_ip(request))
    s.allow_offer_stacking = body.allow_offer_stacking
    await db.commit()
    return {"allow_offer_stacking": s.allow_offer_stacking}


@router.get("/audit-logs")
async def audit_logs(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AuditLog, User.email).outerjoin(User, User.id == AuditLog.actor_user_id)
                             .order_by(AuditLog.created_at.desc()).limit(200))).all()
    return [{"id": a.id, "actor": email, "action": a.action, "entity": a.entity, "entity_id": a.entity_id,
             "details": a.details, "created_at": a.created_at.isoformat()} for a, email in rows]


class RiderEmailIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)


@router.get("/riders")
async def list_riders(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """List all authorized delivery partner users."""
    role = (await db.execute(select(Role).where(Role.name == "rider"))).scalar_one_or_none()
    if not role:
        return {"riders": []}
    stmt = (
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(UserRole.role_id == role.id)
        .order_by(User.name)
    )
    riders = (await db.execute(stmt)).scalars().all()
    return {
        "riders": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "phone": u.phone,
                "created_at": u.created_at.isoformat(),
            }
            for u in riders
        ]
    }


@router.post("/riders/grant")
async def grant_rider_role(
    body: RiderEmailIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Grant delivery partner access to a user account by email."""
    email = body.email.strip().lower()
    target_user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if not target_user:
        raise HTTPException(
            status_code=404,
            detail=f"User with email '{email}' was not found. Please ask the delivery partner to create an account first.",
        )
    role = (await db.execute(select(Role).where(Role.name == "rider"))).scalar_one_or_none()
    if not role:
        role = Role(name="rider")
        db.add(role)
        await db.flush()

    existing = (
        await db.execute(
            select(UserRole).where(UserRole.user_id == target_user.id, UserRole.role_id == role.id)
        )
    ).scalar_one_or_none()
    if not existing:
        db.add(UserRole(user_id=target_user.id, role_id=role.id))
        audit(
            db,
            admin,
            "role_granted",
            "user",
            target_user.id,
            {"role": "rider", "email": target_user.email},
            client_ip(request),
        )
        await db.commit()

    return {
        "ok": True,
        "message": f"Successfully granted delivery partner role to {target_user.name} ({target_user.email}).",
    }


@router.post("/riders/revoke")
async def revoke_rider_role(
    body: RiderEmailIn,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke delivery partner access from a user account by email."""
    email = body.email.strip().lower()
    target_user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    role = (await db.execute(select(Role).where(Role.name == "rider"))).scalar_one_or_none()
    if role:
        existing = (
            await db.execute(
                select(UserRole).where(UserRole.user_id == target_user.id, UserRole.role_id == role.id)
            )
        ).scalar_one_or_none()
        if existing:
            await db.delete(existing)
            audit(
                db,
                admin,
                "role_revoked",
                "user",
                target_user.id,
                {"role": "rider", "email": target_user.email},
                client_ip(request),
            )
            await db.commit()

    return {
        "ok": True,
        "message": f"Revoked delivery partner role from {target_user.email}.",
    }
