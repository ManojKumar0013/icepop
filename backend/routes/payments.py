import json
import logging
import os

import razorpay
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import Order, OrderStatusHistory, Payment, User
from core.notify import deliver_external, notify_order_event
from core.payments import OFFLINE_METHODS, PaymentService, rzp, rzp_call, rzp_keys
from core.referral import award_referral_bonus_if_eligible
from core.security import client_ip, rate_limit, require_user
from core.store import get_settings
from routes.orders import get_owned_order, load_history, order_out

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])
CLOSED = ("cancelled", "refund_pending", "refunded")


async def _payment(db, order_id, lock=False) -> Payment | None:
    stmt = select(Payment).where(Payment.order_id == order_id).order_by(Payment.id.desc())
    if lock:
        stmt = stmt.with_for_update()
    return (await db.execute(stmt)).scalars().first()


async def _my_unpaid_online(db, user, number) -> tuple[Order, Payment]:
    o = await get_owned_order(db, user, number, lock=True)
    if o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    p = await _payment(db, o.id, lock=True)
    if o.payment_status == "paid":
        raise HTTPException(status_code=400, detail="This order is already paid.")
    if o.payment_method != "online" or not p or o.status in CLOSED:
        raise HTTPException(status_code=400, detail="This order can't be paid online.")
    return o, p


class OrderRef(BaseModel):
    order_number: str = Field(max_length=20)


@router.post("/razorpay/order")
async def create_checkout(body: OrderRef, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    rate_limit(f"rzp-order:{user.id}", 20, 600)
    o, p = await _my_unpaid_online(db, user, body.order_number)
    if not p.provider_order_id or p.amount_paise != o.total_paise:
        ro = await rzp_call(rzp().order.create, {"amount": o.total_paise, "currency": "INR", "receipt": o.order_number,
                                                 "notes": {"order_number": o.order_number}})
        p.provider, p.provider_order_id, p.amount_paise = "razorpay", ro["id"], o.total_paise
    order_id = p.provider_order_id
    await db.commit()
    s = await get_settings(db)
    return {"key_id": rzp_keys()[0], "razorpay_order_id": order_id, "amount": o.total_paise, "currency": "INR",
            "name": s.business_name, "description": f"Order {o.order_number}",
            "prefill": {"name": o.customer_name, "email": o.customer_email, "contact": f"+91{o.customer_phone}"}}


class VerifyIn(OrderRef):
    razorpay_order_id: str = Field(max_length=100)
    razorpay_payment_id: str = Field(max_length=100)
    razorpay_signature: str = Field(max_length=200)


async def _after_paid(db, o: Order, p: Payment, background: BackgroundTasks, client_ip_addr: str = "system"):
    u = (await db.execute(select(User).where(User.id == o.user_id))).scalar_one_or_none()
    if u:
        await award_referral_bonus_if_eligible(db, u, o, client_ip_addr)
    await notify_order_event(db, o, "payment_paid")
    events = ["payment_paid"]
    if o.status == "cancelled" and await PaymentService.refund_online(o, p, None, db):
        await notify_order_event(db, o, "refund_pending")
        events.append("refund_pending")
    await db.commit()
    for ev in events:
        background.add_task(deliver_external, o.id, ev)


@router.post("/razorpay/verify")
async def verify(body: VerifyIn, request: Request, background: BackgroundTasks, user: User = Depends(require_user),
                 db: AsyncSession = Depends(get_db)):
    o = await get_owned_order(db, user, body.order_number, lock=True)
    if o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    p = await _payment(db, o.id, lock=True)
    if not p or p.provider_order_id != body.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Payment doesn't belong to this order.")
    client = rzp()
    try:
        client.utility.verify_payment_signature({"razorpay_order_id": body.razorpay_order_id,
                                                 "razorpay_payment_id": body.razorpay_payment_id,
                                                 "razorpay_signature": body.razorpay_signature})
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="We couldn't verify this payment. If money was deducted, it will be confirmed automatically or refunded.")
    rp = await rzp_call(client.payment.fetch, body.razorpay_payment_id)
    if rp.get("status") == "authorized":
        rp = await rzp_call(client.payment.capture, rp["id"], rp["amount"], {"currency": "INR"})
    if rp.get("status") != "captured":
        raise HTTPException(status_code=400, detail="Payment is not complete yet. Please try again.")
    if PaymentService.apply_captured(o, p, rp):
        await _after_paid(db, o, p, background, client_ip(request))
    else:
        await db.commit()
    return order_out(o, await load_history(db, o.id))


class SwitchIn(OrderRef):
    payment_method: str = Field(max_length=30)


@router.post("/switch-method")
async def switch_method(body: SwitchIn, request: Request, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    o, p = await _my_unpaid_online(db, user, body.order_number)
    s = await get_settings(db)
    if body.payment_method not in OFFLINE_METHODS:
        raise HTTPException(status_code=400, detail="Choose pay on delivery or pay at pickup.")
    PaymentService.validate_method(s.payment_methods or [], body.payment_method, o.fulfilment_type)
    o.payment_method = p.method = body.payment_method
    p.provider = "offline"
    await award_referral_bonus_if_eligible(db, user, o, client_ip(request))
    db.add(OrderStatusHistory(order_id=o.id, from_status=o.status, to_status=o.status,
                              note=f"Payment changed to {body.payment_method.replace('_', ' ')}", actor_user_id=user.id))
    await db.commit()
    return order_out(o, await load_history(db, o.id))


@router.post("/wallet/pay")
async def pay_with_wallet(body: OrderRef, background: BackgroundTasks, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    o = await get_owned_order(db, user, body.order_number, lock=True)
    if o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.payment_status == "paid":
        raise HTTPException(status_code=400, detail="This order is already paid.")
    if o.status in CLOSED:
        raise HTTPException(status_code=400, detail="This order is cancelled.")

    user_rec = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one()
    wallet_balance = user_rec.wallet_balance_paise or 0
    if wallet_balance < o.total_paise:
        shortage = o.total_paise - wallet_balance
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. You have ₹{wallet_balance // 100}, but order total is ₹{o.total_paise // 100} (short by ₹{shortage // 100}).",
        )

    user_rec.wallet_balance_paise -= o.total_paise
    o.payment_method = "wallet"
    o.payment_status = "paid"

    p = await _payment(db, o.id, lock=True)
    if not p:
        p = Payment(order_id=o.id, provider="wallet", method="wallet", amount_paise=o.total_paise, status="paid")
        db.add(p)
    else:
        p.provider = "wallet"
        p.method = "wallet"
        p.status = "paid"
        p.amount_paise = o.total_paise
        p.details = {**(p.details or {}), "paid_from_wallet": True, "remaining_wallet_paise": user_rec.wallet_balance_paise}

    db.add(OrderStatusHistory(
        order_id=o.id,
        from_status=o.status,
        to_status=o.status,
        note=f"Paid ₹{o.total_paise // 100} using ICEPOPS Wallet",
        actor_user_id=user.id,
    ))
    await _after_paid(db, o, p, background)
    return order_out(o, await load_history(db, o.id))


@router.post("/razorpay/webhook")
async def webhook(request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    raw = (await request.body()).decode()
    try:
        rzp().utility.verify_webhook_signature(raw, request.headers.get("X-Razorpay-Signature", ""), secret)
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    ev = json.loads(raw)
    event, payload = ev.get("event"), ev.get("payload", {})
    if event in ("payment.captured", "order.paid", "payment.failed"):
        rp = payload.get("payment", {}).get("entity", {})
        p = (await db.execute(select(Payment).where(Payment.provider_order_id == rp.get("order_id"))
                              .with_for_update())).scalar_one_or_none()
        if not p:
            return {"ok": True}
        o = (await db.execute(select(Order).where(Order.id == p.order_id).with_for_update())).scalar_one()
        if event == "payment.failed":
            if p.status != "paid":
                p.details = {**(p.details or {}), "last_error": (rp.get("error_description") or "Payment failed")[:200]}
                await db.commit()
        elif PaymentService.apply_captured(o, p, rp):
            await _after_paid(db, o, p, background)
    elif event in ("refund.processed", "refund.failed"):
        rf = payload.get("refund", {}).get("entity", {})
        p = (await db.execute(select(Payment).where(Payment.provider_payment_id == rf.get("payment_id"))
                              .with_for_update())).scalar_one_or_none()
        if not p:
            return {"ok": True}
        o = (await db.execute(select(Order).where(Order.id == p.order_id).with_for_update())).scalar_one()
        p.details = {**(p.details or {}), "refund_id": rf.get("id"), "refund_status": rf.get("status")}
        if event == "refund.processed" and o.status == "refund_pending":
            o.status, o.payment_status, p.status = "refunded", "refunded", "refunded"
            db.add(OrderStatusHistory(order_id=o.id, from_status="refund_pending", to_status="refunded",
                                      note=f"Refund completed by Razorpay ({rf.get('id')})"))
            await notify_order_event(db, o, "refunded")
            await db.commit()
            background.add_task(deliver_external, o.id, "refunded")
        else:
            await db.commit()
    return {"ok": True}
