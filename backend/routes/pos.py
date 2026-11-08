import re
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import IST
from core.db import get_db
from core.models import Inventory, InventoryMovement, Order, OrderItem, OrderStatusHistory, Payment, ProductVariant, User
from core.security import audit, client_ip, require_admin
from core.store import get_settings, paise
from routes.orders import load_history, order_out

router = APIRouter(prefix="/admin/pos", tags=["admin-pos"])


class PosItemIn(BaseModel):
    variant_id: int
    quantity: int = Field(ge=1, le=50)


class PosOrderIn(BaseModel):
    items: List[PosItemIn] = Field(min_length=1)
    payment_method: str = Field(default="cash")  # "cash", "upi_qr", "card"
    customer_name: Optional[str] = "Counter Customer"
    customer_phone: Optional[str] = "9999999999"
    discount_paise: int = Field(default=0, ge=0)


def _order_number() -> str:
    return f"POS{datetime.now(timezone.utc).astimezone(IST):%y%m%d}-{secrets.token_hex(2).upper()}"


@router.post("/order")
async def create_pos_order(body: PosOrderIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Fast counter POS order execution with instant stock deduction and receipt output."""
    settings = await get_settings(db)
    variant_ids = [i.variant_id for i in body.items]
    variants = (await db.execute(
        select(ProductVariant, Inventory)
        .join(Inventory, Inventory.variant_id == ProductVariant.id)
        .where(ProductVariant.id.in_(variant_ids))
        .with_for_update(of=Inventory)
    )).all()
    v_map = {v.id: (v, inv) for v, inv in variants}

    subtotal = 0
    order_items = []
    movements = []

    for item in body.items:
        if item.variant_id not in v_map:
            raise HTTPException(status_code=400, detail=f"Variant {item.variant_id} not found")
        v, inv = v_map[item.variant_id]
        if inv.track_stock and inv.quantity < item.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {v.name}. Only {inv.quantity} left.")

        line_total = v.price_paise * item.quantity
        subtotal += line_total

        order_items.append({
            "product_id": v.product_id,
            "variant_id": v.id,
            "product_name": v.name,
            "variant_name": v.name,
            "image_url": None,
            "unit_price_paise": v.price_paise,
            "quantity": item.quantity,
            "line_total_paise": line_total,
        })

        if inv.track_stock:
            inv.quantity -= item.quantity
            movements.append(InventoryMovement(variant_id=v.id, change=-item.quantity, reason="pos_sale", actor_user_id=admin.id))

    total = max(0, subtotal - body.discount_paise)
    order_num = _order_number()

    order = Order(
        order_number=order_num,
        user_id=admin.id,
        idempotency_key=secrets.token_hex(16),
        status="delivered",
        fulfilment_type="counter_pos",
        customer_name=body.customer_name or "Counter Customer",
        customer_phone=body.customer_phone or "9999999999",
        customer_email="counter@icepops.local",
        subtotal_paise=subtotal,
        discount_paise=body.discount_paise,
        delivery_fee_paise=0,
        total_paise=total,
        payment_method=body.payment_method,
        payment_status="paid",
        is_pos=True,
        pricing_breakdown={"subtotal_paise": subtotal, "discount_paise": body.discount_paise, "total_paise": total},
    )
    db.add(order)
    await db.flush()

    for oi in order_items:
        db.add(OrderItem(order_id=order.id, **oi))
    for mv in movements:
        mv.order_id = order.id
        db.add(mv)

    db.add(OrderStatusHistory(order_id=order.id, from_status=None, to_status="delivered", note="In-store counter POS sale", actor_user_id=admin.id))
    db.add(Payment(order_id=order.id, provider="pos", method=body.payment_method, amount_paise=total, status="paid", details={"cashier_id": admin.id}))

    audit(db, admin, "pos_sale", "order", order_num, {"total_paise": total, "items_count": len(body.items)}, client_ip(request))
    await db.commit()

    # Dynamic UPI QR payload for PhonePe, GPay, Paytm:
    rupees = total / 100
    upi_payload = f"upi://pay?pa=6303592919@ybl&pn=ICEPOPS&am={rupees:.2f}&tr={order_num}&cu=INR&tn=Order_{order_num}"

    return {
        "ok": True,
        "order_number": order_num,
        "total_paise": total,
        "payment_method": body.payment_method,
        "upi_qr_string": upi_payload,
        "receipt": {
            "business_name": settings.business_name,
            "address": f"{settings.address_line}, {settings.city} {settings.pincode}",
            "fssai": settings.fssai_number,
            "order_number": order_num,
            "date": datetime.now(timezone.utc).astimezone(IST).strftime("%d-%b-%Y %I:%M %p"),
            "items": order_items,
            "subtotal": paise(subtotal),
            "discount": paise(body.discount_paise),
            "total": paise(total),
            "payment": body.payment_method.upper(),
        }
    }


@router.get("/daily-summary")
async def pos_daily_summary(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Summary of today's in-store counter cash vs UPI collections."""
    today = datetime.now(timezone.utc).astimezone(IST).date()
    orders = (await db.execute(
        select(Order.payment_method, Order.total_paise, Order.created_at)
        .where(Order.is_pos.is_(True), Order.status == "delivered")
    )).all()

    today_orders = [o for o in orders if o.created_at.astimezone(IST).date() == today]
    cash_total = sum(o.total_paise for o in today_orders if o.payment_method == "cash")
    upi_total = sum(o.total_paise for o in today_orders if o.payment_method in ("upi_qr", "online"))
    card_total = sum(o.total_paise for o in today_orders if o.payment_method == "card")

    return {
        "today_date": today.isoformat(),
        "total_pos_orders": len(today_orders),
        "total_sales_paise": cash_total + upi_total + card_total,
        "cash_paise": cash_total,
        "upi_paise": upi_total,
        "card_paise": card_total,
    }
