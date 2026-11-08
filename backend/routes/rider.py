import urllib.parse
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.loyalty import loyalty_promo, loyalty_text
from core.models import LoyaltyStamp, Order, OrderItem, OrderStatusHistory, Payment, User
from core.notify import deliver_external, notify_order_event, user_lang
from core.security import get_optional_user

router = APIRouter(prefix="/rider", tags=["rider"])


class RiderClaimIn(BaseModel):
    rider_name: str = Field(min_length=2, max_length=80)
    rider_phone: str = Field(min_length=10, max_length=15)


class RiderVerifyIn(BaseModel):
    otp: str = Field(min_length=4, max_length=6)
    collect_cod: bool = False
    note: Optional[str] = Field(None, max_length=200)


@router.get("/orders")
async def list_rider_orders(db: AsyncSession = Depends(get_db)):
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
    user: Optional[User] = Depends(get_optional_user),
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
            actor_user_id=user.id if user else None,
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
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify customer 4-digit OTP and mark order delivered with instant loyalty stamp trigger."""
    order = (await db.execute(select(Order).where(Order.order_number == number).with_for_update())).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "out_for_delivery":
        raise HTTPException(status_code=400, detail=f"Order is '{order.status}', not out_for_delivery.")

    # OTP check
    expected_otp = (order.delivery_otp or "").strip()
    if expected_otp and body.otp.strip() != expected_otp:
        raise HTTPException(
            status_code=400,
            detail="Invalid Delivery OTP. Please ask the customer to share their 4-digit code from the ICEPOPS screen.",
        )

    prev = order.status
    order.status = "delivered"

    if order.payment_method == "cod" and order.payment_status != "paid":
        order.payment_status = "paid"
        pmt = (await db.execute(select(Payment).where(Payment.order_id == order.id))).scalar_one_or_none()
        if pmt:
            pmt.status = "paid"
            pmt.details = {
                **(pmt.details or {}),
                "collected_by_rider": order.rider_name or "rider",
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }

    # Award loyalty stamps if applicable
    extra = ""
    lp = await loyalty_promo(db)
    if lp and lp.is_enabled and not (await db.execute(select(LoyaltyStamp.id).where(LoyaltyStamp.order_id == order.id))).first():
        db.add(LoyaltyStamp(user_id=order.user_id, order_id=order.id))
        await db.flush()
        extra = await loyalty_text(db, order.user_id, await user_lang(db, order.user_id))

    rider_label = order.rider_name or "Delivery Rider"
    note_content = f"Delivered and verified with 4-digit OTP by {rider_label}"
    if body.note:
        note_content += f" ({body.note.strip()})"

    db.add(
        OrderStatusHistory(
            order_id=order.id,
            from_status=prev,
            to_status="delivered",
            note=note_content,
            actor_user_id=user.id if user else None,
        )
    )

    await notify_order_event(db, order, "delivered", extra)
    await db.commit()
    background.add_task(deliver_external, order.id, "delivered")

    return {
        "ok": True,
        "order_number": order.order_number,
        "status": "delivered",
        "message": "Delivery verified successfully!",
    }
