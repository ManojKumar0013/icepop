import urllib.parse
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.delivery import OTP_MAX_RESENDS, check_delivery_otp, complete_delivery, new_delivery_otp, otp_state
from core.loyalty import loyalty_promo, loyalty_text  # noqa: F401 (kept for other rider views)
from core.models import LoyaltyStamp, Order, OrderItem, OrderStatusHistory, Payment, User  # noqa: F401
from core.notify import deliver_external, notify_order_event, user_lang  # noqa: F401
from core.security import audit, require_user

router = APIRouter(prefix="/rider", tags=["rider"])


async def require_rider(user: User = Depends(require_user)) -> User:
    """Security check: only authorized staff with 'rider' or 'admin' roles can access rider features."""
    if "rider" not in user.role_names and "admin" not in user.role_names:
        raise HTTPException(
            status_code=403,
            detail="Access restricted: You do not have delivery partner permissions. Please contact the administrator.",
        )
    return user


class RiderClaimIn(BaseModel):
    rider_name: str = Field(min_length=2, max_length=80)
    rider_phone: str = Field(min_length=10, max_length=15)


class RiderVerifyIn(BaseModel):
    otp: str = Field(min_length=4, max_length=6)
    collect_cod: bool = False
    note: Optional[str] = Field(None, max_length=200)


@router.get("/orders")
async def list_rider_orders(
    rider: User = Depends(require_rider),
    db: AsyncSession = Depends(get_db),
):
    """Active delivery queue for riders: ready for pickup, out for delivery, and recently delivered."""
    stmt = (
        select(Order)
        .where(
            Order.fulfilment_type == "delivery",
            Order.status.in_(["confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "delivered"]),
        )
        .order_by(Order.created_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()

    # Prioritize: out_for_delivery, ready_for_pickup, preparing, confirmed, delivered
    priority = {"out_for_delivery": 0, "ready_for_pickup": 1, "preparing": 2, "confirmed": 3, "delivered": 4}
    sorted_orders = sorted(rows, key=lambda o: (priority.get(o.status, 5), -o.id))

    result = []
    delivered_count = 0
    for o in sorted_orders:
        if o.status == "delivered":
            if delivered_count >= 10:
                continue
            delivered_count += 1

        addr_parts = [p for p in [o.address_line1, o.address_line2, o.area, o.city, o.pincode] if p]
        full_address = ", ".join(addr_parts)
        maps_query = urllib.parse.quote(f"{full_address}, India")
        maps_url = f"https://www.google.com/maps/search/?api=1&query={maps_query}"

        result.append({
            "order_number": o.order_number,
            "status": o.status,
            "customer_name": o.customer_name,
            "customer_phone": o.customer_phone,
            "full_address": full_address,
            "address_line1": o.address_line1,
            "address_line2": o.address_line2,
            "area": o.area,
            "city": o.city,
            "pincode": o.pincode,
            "delivery_instructions": o.delivery_instructions,
            "total_paise": o.total_paise,
            "payment_method": o.payment_method,
            "payment_status": o.payment_status,
            "rider_name": o.rider_name,
            "rider_phone": o.rider_phone,
            **otp_state(o),
            "google_maps_url": maps_url,
            "created_at": o.created_at.isoformat(),
            "items": [
                {
                    "product_name": it.product_name,
                    "variant_name": it.variant_name,
                    "quantity": it.quantity,
                }
                for it in o.items
            ],
        })

    return {"orders": result}


@router.post("/orders/{number}/claim")
async def claim_delivery(
    number: str,
    body: RiderClaimIn,
    background: BackgroundTasks,
    rider: User = Depends(require_rider),
    db: AsyncSession = Depends(get_db),
):
    """Assign delivery partner to an order and move status to out_for_delivery."""
    order = (await db.execute(select(Order).where(Order.order_number == number).with_for_update())).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.fulfilment_type != "delivery":
        raise HTTPException(status_code=400, detail="This is a pickup/counter order, not delivery.")
    if order.status not in ("ready_for_pickup", "confirmed", "preparing", "out_for_delivery"):
        raise HTTPException(status_code=400, detail=f"Cannot claim order in '{order.status}' status.")

    prev = order.status
    order.status = "out_for_delivery"
    order.rider_name = body.rider_name.strip()
    order.rider_phone = body.rider_phone.strip()

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=prev,
            to_status="out_for_delivery",
            note=f"Assigned to delivery rider {order.rider_name} ({order.rider_phone})",
            actor_user_id=rider.id,
        )
    )

    await notify_order_event(db, order, "out_for_delivery")
    await db.commit()
    background.add_task(deliver_external, order.id, "out_for_delivery")

    return {
        "ok": True,
        "order_number": order.order_number,
        "status": order.status,
        "rider_name": order.rider_name,
        "rider_phone": order.rider_phone,
    }


@router.post("/orders/{number}/verify-delivery")
async def verify_and_complete_delivery(
    number: str,
    body: RiderVerifyIn,
    background: BackgroundTasks,
    rider: User = Depends(require_rider),
    db: AsyncSession = Depends(get_db),
):
    """Verify the customer's 4-digit delivery OTP (5 wrong attempts -> locked) and mark the order delivered."""
    order = (await db.execute(select(Order).where(Order.order_number == number).with_for_update())).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "out_for_delivery":
        raise HTTPException(status_code=400, detail=f"Order is '{order.status}', not out_for_delivery.")

    error = check_delivery_otp(order, body.otp)
    if error:
        locked = bool(order.otp_locked)
        await db.commit()  # persist the wrong attempt / lock
        raise HTTPException(status_code=423 if locked else 400, detail=error)

    rider_label = order.rider_name or "Delivery Rider"
    note_content = f"Delivered and verified with 4-digit OTP by {rider_label}"
    if body.note:
        note_content += f" ({body.note.strip()})"
    extra = await complete_delivery(db, order, rider, note_content)
    await notify_order_event(db, order, "delivered", extra)
    await db.commit()
    background.add_task(deliver_external, order.id, "delivered")
    return {"ok": True, "order_number": order.order_number, "status": "delivered", "message": "Delivery verified successfully!"}


@router.post("/orders/{number}/resend-otp")
async def resend_delivery_otp(
    number: str,
    background: BackgroundTasks,
    rider: User = Depends(require_rider),
    db: AsyncSession = Depends(get_db),
):
    """Generate a fresh delivery OTP (max 3 times per order), unlock, and re-send it to the customer
    (in-app + email now; SMS/WhatsApp as soon as a provider is connected)."""
    order = (await db.execute(select(Order).where(Order.order_number == number).with_for_update())).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "out_for_delivery":
        raise HTTPException(status_code=400, detail=f"Order is '{order.status}', not out_for_delivery.")
    if (order.otp_resends or 0) >= OTP_MAX_RESENDS:
        raise HTTPException(status_code=429, detail=f"Resend limit reached ({OTP_MAX_RESENDS}). Please ask the shop to override the delivery OTP.")
    order.delivery_otp = new_delivery_otp()
    order.otp_resends = (order.otp_resends or 0) + 1
    order.otp_attempts = 0
    order.otp_locked = False
    db.add(OrderStatusHistory(order_id=order.id, from_status=order.status, to_status=order.status,
                              note=f"Delivery OTP re-sent to customer ({order.otp_resends}/{OTP_MAX_RESENDS}) by {order.rider_name or rider.name}",
                              actor_user_id=rider.id))
    audit(db, rider, "delivery_otp_resent", "order", order.order_number, {"resends": order.otp_resends})
    await notify_order_event(db, order, "otp_resent")
    await db.commit()
    background.add_task(deliver_external, order.id, "otp_resent")
    return {"ok": True, "order_number": order.order_number, **otp_state(order),
            "message": "A new delivery OTP has been sent to the customer."}
