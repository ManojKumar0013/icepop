"""Shared delivery completion + delivery-OTP helpers used by the rider portal and the admin override."""
import secrets
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.loyalty import loyalty_promo, loyalty_text
from core.models import LoyaltyStamp, Order, OrderStatusHistory, Payment, User
from core.notify import user_lang

OTP_MAX_WRONG_ATTEMPTS = 5
OTP_MAX_RESENDS = 3


def new_delivery_otp() -> str:
    return f"{secrets.randbelow(9000) + 1000}"


def otp_state(order: Order) -> dict:
    attempts = order.otp_attempts or 0
    return {
        "otp_attempts": attempts,
        "otp_attempts_left": max(0, OTP_MAX_WRONG_ATTEMPTS - attempts),
        "otp_locked": bool(order.otp_locked),
        "otp_resends": order.otp_resends or 0,
        "otp_resends_left": max(0, OTP_MAX_RESENDS - (order.otp_resends or 0)),
    }


async def complete_delivery(db: AsyncSession, order: Order, actor: User, note: str) -> str:
    """Mark an out-for-delivery order delivered: COD payment, loyalty stamp, history. Returns loyalty extra text."""
    prev = order.status
    order.status = "delivered"
    if order.payment_method in ("cod", "pay_on_delivery") and order.payment_status != "paid":
        order.payment_status = "paid"
        pmt = (await db.execute(select(Payment).where(Payment.order_id == order.id))).scalar_one_or_none()
        if pmt:
            pmt.status = "paid"
            pmt.details = {**(pmt.details or {}), "collected_by_rider": order.rider_name or actor.name,
                           "collected_at": datetime.now(timezone.utc).isoformat()}
    extra = ""
    lp = await loyalty_promo(db)
    if lp and lp.is_enabled and not (await db.execute(select(LoyaltyStamp.id).where(LoyaltyStamp.order_id == order.id))).first():
        db.add(LoyaltyStamp(user_id=order.user_id, order_id=order.id))
        await db.flush()
        extra = await loyalty_text(db, order.user_id, await user_lang(db, order.user_id))
    db.add(OrderStatusHistory(order_id=order.id, from_status=prev, to_status="delivered", note=note, actor_user_id=actor.id))
    return extra


def check_delivery_otp(order: Order, otp: Optional[str]) -> Optional[str]:
    """Return None when the OTP is correct; otherwise an error message (and bump attempts / lock)."""
    if order.otp_locked:
        return ("Delivery OTP is locked after too many wrong attempts. Use 'Resend OTP' to send the customer a new "
                "code, or ask the shop to override.")
    expected = (order.delivery_otp or "").strip()
    if not expected or (otp or "").strip() == expected:
        order.otp_attempts = 0
        return None
    order.otp_attempts = (order.otp_attempts or 0) + 1
    left = OTP_MAX_WRONG_ATTEMPTS - order.otp_attempts
    if left <= 0:
        order.otp_locked = True
        return ("Invalid Delivery OTP. The code is now locked after 5 wrong attempts - use 'Resend OTP' "
                "to send the customer a new code, or ask the shop to override.")
    return f"Invalid Delivery OTP. Please ask the customer for the 4-digit code shown in their ICEPOPS order page. {left} attempt(s) left."
