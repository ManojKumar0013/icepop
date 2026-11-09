import asyncio
import json
import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import Field, field_validator, model_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import IST
from core.db import get_db
from core.models import (
    Address, Cart, CartItem, CouponRedemption, Inventory, InventoryMovement, Order, OrderItem,
    OrderStatusHistory, Payment, PromotionRedemption, Review, Role, User,
)
from core.notify import STATUS_LABELS, broadcaster, deliver_external, notify_order_event
from core.payments import PaymentService
from core.pricing import build_quote, first_order_key, public_quote
from core.security import (
    create_session, get_optional_user, normalize_phone, rate_limit, require_user, user_out, validate_pincode,
)
from core.store import get_settings, validate_order_time
from routes.cart import QuoteIn

router = APIRouter(prefix="/orders", tags=["orders"])
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")


class OrderIn(QuoteIn):
    idempotency_key: str
    customer_name: str = Field(min_length=2, max_length=80)
    customer_phone: str
    customer_email: Optional[str] = Field(None, max_length=255)
    address_line1: Optional[str] = Field(None, max_length=200)
    address_line2: Optional[str] = Field(None, max_length=200)
    area: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=80)
    delivery_instructions: Optional[str] = Field(None, max_length=300)
    preferred_time: Optional[datetime] = None
    payment_method: str = Field(max_length=30)
    save_address: bool = False
    expected_total_paise: Optional[int] = Field(None, ge=0)
    use_wallet: bool = False

    @field_validator("customer_phone")
    @classmethod
    def _phone(cls, v):
        return normalize_phone(v)

    @field_validator("idempotency_key")
    @classmethod
    def _key(cls, v):
        if not IDEMPOTENCY_RE.match(v):
            raise ValueError("Invalid request key")
        return v

    @model_validator(mode="after")
    def _delivery_fields(self):
        if self.fulfilment_type == "delivery":
            if not (self.address_line1 and self.area and self.city and self.pincode):
                raise ValueError("Address, area, city and PIN code are required for delivery")
            self.pincode = validate_pincode(self.pincode)
        return self


def should_reveal_otp(o: Order, admin: bool) -> bool:
    if admin:
        return True
    if o.fulfilment_type != "delivery":
        return False
    if o.payment_method == "online" and o.payment_status != "paid":
        return False
    if o.status in ("pending_confirmation", "cancelled", "refund_pending", "refunded"):
        return False
    return True


def order_out(o: Order, history=None, payment: Payment = None, admin=False) -> dict:
    out = {
        "order_number": o.order_number, "status": o.status, "status_label": STATUS_LABELS.get(o.status, o.status),
        "fulfilment_type": o.fulfilment_type, "customer_name": o.customer_name, "customer_phone": o.customer_phone,
        "address_line1": o.address_line1, "address_line2": o.address_line2, "area": o.area, "city": o.city,
        "pincode": o.pincode, "delivery_instructions": o.delivery_instructions,
        "preferred_time": o.preferred_time.isoformat() if o.preferred_time else None,
        "subtotal_paise": o.subtotal_paise, "discount_paise": o.discount_paise,
        "delivery_fee_paise": o.delivery_fee_paise, "total_paise": o.total_paise,
        "discounts": (o.pricing_breakdown or {}).get("discounts", []),
        "delivery_savings_paise": (o.pricing_breakdown or {}).get("delivery_savings_paise", 0),
        "wallet_deducted_paise": (o.pricing_breakdown or {}).get("wallet_deducted_paise", 0),
        "original_total_paise": (o.pricing_breakdown or {}).get("original_total_paise", o.total_paise),
        "coupon_code": o.coupon_code, "payment_method": o.payment_method, "payment_status": o.payment_status,
        "cancel_reason": o.cancel_reason, "created_at": o.created_at.isoformat(), "updated_at": o.updated_at.isoformat(),
        "delivery_otp": o.delivery_otp if should_reveal_otp(o, admin) else None,
        "rider_name": o.rider_name, "rider_phone": o.rider_phone, "is_pos": o.is_pos,
        "items": [{"variant_id": i.variant_id, "product_name": i.product_name, "variant_name": i.variant_name, "image_url": i.image_url,
                   "unit_price_paise": i.unit_price_paise, "quantity": i.quantity, "free_quantity": i.free_quantity,
                   "discount_paise": i.discount_paise, "line_total_paise": i.line_total_paise} for i in o.items],
    }
    if history is not None:
        out["history"] = [{"to_status": h.to_status, "label": STATUS_LABELS.get(h.to_status, h.to_status),
                           "note": h.note, "created_at": h.created_at.isoformat()} for h in history]
    if admin:
        out["id"] = o.id
        out["customer_email"] = o.customer_email
        if payment:
            out["payment"] = {"provider": payment.provider, "method": payment.method, "status": payment.status,
                              "amount_paise": payment.amount_paise, "reference": payment.provider_payment_id,
                              "provider_order_id": payment.provider_order_id,
                              "refund_id": (payment.details or {}).get("refund_id"),
                              "refund_status": (payment.details or {}).get("refund_status"),
                              "bank": (payment.details or {}).get("bank"), "wallet": (payment.details or {}).get("wallet"),
                              "card_network": (payment.details or {}).get("card_network"),
                              "last_error": (payment.details or {}).get("last_error")}
    return out


async def load_history(db, order_id):
    return (await db.execute(select(OrderStatusHistory).where(OrderStatusHistory.order_id == order_id)
                             .order_by(OrderStatusHistory.created_at))).scalars().all()


def _order_number() -> str:
    return f"IP{datetime.now(timezone.utc).astimezone(IST):%y%m%d}-{secrets.token_hex(3).upper()}"


@router.post("")
async def place_order(body: OrderIn, background: BackgroundTasks, response: Response,
                      user: Optional[User] = Depends(get_optional_user),
                      db: AsyncSession = Depends(get_db)):
    auth_token = None
    if not user:
        clean_phone = body.customer_phone.replace("+", "").replace("-", "").replace(" ", "")
        user = None
        if body.customer_email and body.customer_email.strip():
            user = (await db.execute(select(User).where(User.email == body.customer_email.strip().lower()))).scalar_one_or_none()
        if not user:
            user = (await db.execute(select(User).where(User.phone == body.customer_phone))).scalar_one_or_none()
        if not user and clean_phone != body.customer_phone:
            user = (await db.execute(select(User).where(User.phone == clean_phone))).scalar_one_or_none()
        target_email = body.customer_email.strip().lower() if body.customer_email and body.customer_email.strip() else f"{clean_phone}@customer.icepops.in"
        if not user:
            customer_role = (await db.execute(select(Role).where(Role.name == "customer"))).scalar_one_or_none()
            user = User(
                name=body.customer_name.strip(),
                email=target_email,
                phone=body.customer_phone,
                roles=[customer_role] if customer_role else [],
                is_active=True,
            )
            db.add(user)
            await db.flush()
        elif body.customer_email and body.customer_email.strip() and user.email != body.customer_email.strip().lower():
            email_taken = (await db.execute(select(User.id).where(User.email == body.customer_email.strip().lower()))).first()
            if not email_taken and user.email.endswith("@customer.icepops.in"):
                user.email = body.customer_email.strip().lower()
        auth_token = await create_session(db, user, response)

    existing = (await db.execute(select(Order).where(Order.idempotency_key == body.idempotency_key))).scalar_one_or_none()
    if existing:
        if existing.user_id != user.id:
            raise HTTPException(status_code=409, detail="Duplicate request")
        res = order_out(existing, await load_history(db, existing.id))
        if auth_token:
            res["token"] = auth_token
            res["user"] = user_out(user, token=auth_token)
        return res
    time_error = await validate_order_time(db, body.preferred_time)
    if time_error:
        raise HTTPException(status_code=400, detail=time_error)
    rate_limit(f"order:{user.id}", 30, 600)
    settings = await get_settings(db)
    PaymentService.validate_method(settings.payment_methods or [], body.payment_method, body.fulfilment_type)

    # Serialise this customer's checkouts so one-time offers can't be redeemed twice in parallel.
    user_record = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one()
    current_wallet = user_record.wallet_balance_paise or 0
    is_direct_wallet = (body.payment_method == "wallet")
    use_wallet = body.use_wallet or is_direct_wallet

    q = await build_quote(db, user, body.items, body.coupon_code, body.fulfilment_type, body.pincode, lock=True,
                          use_reward=body.use_loyalty_reward)
    if q["errors"]:
        await db.rollback()
        raise HTTPException(status_code=400, detail=q["errors"][0])
    if body.coupon_code and body.coupon_code.strip() and q["coupon_error"]:
        await db.rollback()
        raise HTTPException(status_code=400, detail=q["coupon_error"])

    order_base_total = q["total_paise"]

    wallet_deduction = 0
    if use_wallet and current_wallet > 0:
        wallet_deduction = min(current_wallet, order_base_total)

    if is_direct_wallet and wallet_deduction < order_base_total:
        shortage = order_base_total - current_wallet
        await db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. You have ₹{current_wallet // 100}, but order total is ₹{order_base_total // 100} (short by ₹{shortage // 100}).",
        )

    payable_total = order_base_total - wallet_deduction
    effective_method = "wallet" if payable_total == 0 else body.payment_method
    effective_payment_status = "paid" if payable_total == 0 else "pending"

    if body.expected_total_paise is not None:
        if body.expected_total_paise not in (payable_total, order_base_total):
            await db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Your order total has changed. Please review the new total and place the order again."
            )

    if wallet_deduction > 0:
        user_record.wallet_balance_paise = current_wallet - wallet_deduction
        user.wallet_balance_paise = user_record.wallet_balance_paise

    delivery = body.fulfilment_type == "delivery"
    delivery_otp = f"{secrets.randbelow(9000) + 1000}" if delivery else None
    cust_email = (body.customer_email.strip().lower() if body.customer_email and body.customer_email.strip() else None) or user.email
    order = Order(
        order_number=_order_number(), user_id=user.id, idempotency_key=body.idempotency_key,
        status="pending_confirmation", fulfilment_type=body.fulfilment_type,
        customer_name=body.customer_name.strip(), customer_phone=body.customer_phone, customer_email=cust_email,
        address_line1=body.address_line1 if delivery else None, address_line2=body.address_line2 if delivery else None,
        area=body.area if delivery else None, city=body.city if delivery else None,
        pincode=body.pincode if delivery else None, delivery_instructions=body.delivery_instructions,
        preferred_time=body.preferred_time, subtotal_paise=q["subtotal_paise"], discount_paise=q["discount_paise"],
        delivery_fee_paise=q["delivery_fee_paise"],
        total_paise=payable_total if payable_total > 0 else order_base_total,
        pricing_breakdown={"discounts": q["discounts"], "delivery_savings_paise": q["delivery_savings_paise"],
                           "notes": q["notes"], "wallet_deducted_paise": wallet_deduction, "original_total_paise": order_base_total},
        coupon_code=q["coupon_code"], payment_method=effective_method,
        payment_status=effective_payment_status,
        delivery_otp=delivery_otp,
    )
    db.add(order)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        existing = (await db.execute(select(Order).where(Order.idempotency_key == body.idempotency_key))).scalar_one_or_none()
        if existing and existing.user_id == user.id:
            return order_out(existing, await load_history(db, existing.id))
        raise HTTPException(status_code=409, detail="Please try placing the order again.")

    inventories = {inv.variant_id: inv for inv in (await db.execute(
        select(Inventory).where(Inventory.variant_id.in_([l["variant_id"] for l in q["lines"]])))).scalars()}
    for l in q["lines"]:
        db.add(OrderItem(order_id=order.id, product_id=l["product_id"], variant_id=l["variant_id"],
                         product_name=l["product_name"], variant_name=l["variant_name"], image_url=l["image_url"],
                         unit_price_paise=l["unit_price_paise"], quantity=l["quantity"], free_quantity=l["free_quantity"],
                         discount_paise=l["discount_paise"], line_total_paise=l["line_total_paise"] - l["discount_paise"]))
        inv = inventories[l["variant_id"]]
        if inv.track_stock:
            inv.quantity -= l["quantity"]
            db.add(InventoryMovement(variant_id=l["variant_id"], change=-l["quantity"], reason="order", order_id=order.id))

    for cand in q["_applied"]:
        if cand["kind"] == "coupon":
            db.add(CouponRedemption(coupon_id=cand["coupon_id"], user_id=user.id, order_id=order.id, discount_paise=cand["amount"]))
        else:
            db.add(PromotionRedemption(promotion_id=cand["promotion_id"], user_id=user.id, order_id=order.id,
                                       discount_paise=cand["amount"],
                                       once_key=first_order_key(user.id) if cand["code"] == "first_order" else None))

    if wallet_deduction > 0:
        db.add(Payment(
            order_id=order.id,
            provider="wallet",
            method="wallet",
            amount_paise=wallet_deduction,
            status="paid",
            details={"paid_from_wallet": True, "remaining_wallet_paise": user.wallet_balance_paise},
        ))
    if payable_total > 0:
        db.add(PaymentService.create_pending(order))
        db.add(OrderStatusHistory(
            order_id=order.id,
            from_status=None,
            to_status="pending_confirmation",
            note=f"Order placed" + (f" (₹{wallet_deduction // 100} paid from wallet, ₹{payable_total // 100} via {effective_method})" if wallet_deduction > 0 else ""),
            actor_user_id=user.id,
        ))
    else:
        db.add(OrderStatusHistory(
            order_id=order.id,
            from_status=None,
            to_status="pending_confirmation",
            note=f"Paid ₹{wallet_deduction // 100} in full using ICEPOPS Wallet",
            actor_user_id=user.id,
        ))
    if body.save_address and delivery:
        has = (await db.execute(select(Address.id).where(Address.user_id == user.id, Address.pincode == body.pincode,
                                                         Address.line1 == body.address_line1))).first()
        if not has:
            db.add(Address(user_id=user.id, label="Home", name=order.customer_name, phone=order.customer_phone,
                           line1=body.address_line1, line2=body.address_line2, area=body.area, city=body.city,
                           pincode=body.pincode, instructions=body.delivery_instructions))
    cart = (await db.execute(select(Cart).where(Cart.user_id == user.id))).scalar_one_or_none()
    if cart:
        await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    await notify_order_event(db, order, "placed")
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="This offer has already been used. Please review your cart and try again.")
    background.add_task(deliver_external, order.id, "placed")
    order = (await db.execute(select(Order).where(Order.id == order.id)
                              .execution_options(populate_existing=True))).scalar_one()
    res = order_out(order, await load_history(db, order.id))
    if auth_token:
        res["token"] = auth_token
        res["user"] = user_out(user, token=auth_token)
    return res


@router.get("")
async def my_orders(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()).limit(100))).scalars()
    return [order_out(o) for o in rows]


@router.get("/events")
async def order_events(request: Request):
    """Server-Sent Events (SSE) stream for real-time order updates to customers & admin."""
    async def event_generator():
        q = broadcaster.subscribe()
        try:
            # Immediate connection acknowledgement
            yield f"event: connected\ndata: {json.dumps({'time': datetime.now(timezone.utc).isoformat()})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"event: order_update\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat comment
                    yield ": heartbeat\n\n"
        finally:
            broadcaster.unsubscribe(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def get_owned_order(db, user: User, number: str, lock=False) -> Order:
    stmt = select(Order).where(Order.order_number == number)
    if lock:
        stmt = stmt.with_for_update()
    o = (await db.execute(stmt)).scalar_one_or_none()
    if not o or (o.user_id != user.id and "admin" not in user.role_names):
        raise HTTPException(status_code=404, detail="Order not found")
    return o


@router.get("/{number}")
async def order_detail(number: str, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    o = await get_owned_order(db, user, number)
    out = order_out(o, await load_history(db, o.id))
    r = (await db.execute(select(Review).where(Review.order_id == o.id))).scalar_one_or_none()
    out["review"] = {"rating": r.rating, "comment": r.comment, "status": r.status, "reply": r.reply} if r else None
    out["can_review"] = o.status == "delivered" and not r and o.user_id == user.id
    if o.payment_method == "online" and o.payment_status == "pending":
        p = (await db.execute(select(Payment).where(Payment.order_id == o.id).order_by(Payment.id.desc()))).scalars().first()
        out["payment_error"] = (p.details or {}).get("last_error") if p else None
    return out


async def release_order_resources(db: AsyncSession, order: Order, actor_id: int) -> None:
    for item in order.items:
        inv = (await db.execute(select(Inventory).where(Inventory.variant_id == item.variant_id).with_for_update())).scalar_one()
        if inv.track_stock:
            inv.quantity += item.quantity
            db.add(InventoryMovement(variant_id=item.variant_id, change=item.quantity, reason="order_cancelled",
                                     order_id=order.id, actor_user_id=actor_id))
    for r in (await db.execute(select(CouponRedemption).where(CouponRedemption.order_id == order.id))).scalars():
        r.status = "void"
    for r in (await db.execute(select(PromotionRedemption).where(PromotionRedemption.order_id == order.id))).scalars():
        r.status, r.once_key = "void", None


@router.post("/{number}/cancel")
async def cancel_my_order(number: str, request: Request, background: BackgroundTasks,
                          user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    o = await get_owned_order(db, user, number, lock=True)
    if o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.status != "pending_confirmation":
        raise HTTPException(status_code=400, detail="This order can no longer be cancelled online. Please contact the shop.")
    o.status, o.cancel_reason = "cancelled", "Cancelled by customer"
    await release_order_resources(db, o, user.id)
    db.add(OrderStatusHistory(order_id=o.id, from_status="pending_confirmation", to_status="cancelled",
                              note="Cancelled by customer", actor_user_id=user.id))
    payment = (await db.execute(select(Payment).where(Payment.order_id == o.id).order_by(Payment.id.desc()))).scalars().first()
    event = "cancelled"
    if await PaymentService.refund_online(o, payment, user.id, db):
        event = "refund_pending"
    elif payment and payment.status == "pending":
        payment.status = o.payment_status = "cancelled"
    await notify_order_event(db, o, event)
    await db.commit()
    background.add_task(deliver_external, o.id, event)
    return order_out(o, await load_history(db, o.id))
