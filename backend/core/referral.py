from datetime import datetime, timezone
import re
from typing import Optional
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession
from core.models import AuditLog, Notification, Order, User
from core.security import audit

REFERRAL_BONUS_PAISE = 1000  # ₹10 to each person


async def find_referrer(db: AsyncSession, ref_code: str) -> Optional[User]:
    """Find user associated with referral code (by exact match or generated prefix)."""
    if not ref_code or not ref_code.strip():
        return None
    clean = ref_code.strip().upper()
    referrer = (await db.execute(select(User).where(func.upper(User.referral_code) == clean))).scalar_one_or_none()
    if referrer:
        return referrer
    # Fallback pattern match (e.g. MANOJ10 or MANOJ20)
    all_users = (await db.execute(select(User))).scalars().all()
    for u in all_users:
        gen = re.sub(r"[^A-Za-z]", "", (u.name or "ICE").split()[0]).upper()[:6]
        if f"{gen}10" == clean or f"{gen}20" == clean:
            return u
    return None


async def award_referral_bonus_if_eligible(
    db: AsyncSession,
    user: User,
    order: Order,
    client_ip_addr: str = "system",
) -> bool:
    """
    Awards ₹10 to both the new customer and the referrer after the new customer's
    first order / successful transaction is placed.
    Ensures:
      - Only awarded ONCE per customer (checked via active AuditLog action 'referral_bonus_welcome')
      - Customer must be referred (via user.referred_by_id or order pricing_breakdown)
      - Customer cannot refer themselves
      - Prior successful orders check (must be the first order)
    """
    # 1. Check if an active welcome bonus was already awarded (and not reversed)
    awarded_welcomes = (await db.execute(
        select(AuditLog).where(
            AuditLog.actor_user_id == user.id,
            AuditLog.action == "referral_bonus_welcome",
        )
    )).scalars().all()

    reversed_orders = set((await db.execute(
        select(AuditLog.entity_id).where(
            AuditLog.actor_user_id == user.id,
            AuditLog.action == "referral_bonus_welcome_reversal",
        )
    )).scalars().all())

    active_welcomes = [a for a in awarded_welcomes if (a.details or {}).get("order_number") not in reversed_orders]
    if active_welcomes:
        return False

    # 2. Check if this is the customer's first valid order
    prev_orders = (await db.execute(
        select(func.count(Order.id)).where(
            Order.user_id == user.id,
            Order.id != order.id,
            Order.status.not_in(["cancelled", "refund_pending", "refunded"]),
        )
    )).scalar() or 0
    if prev_orders > 0:
        return False

    # 3. Resolve referrer
    user_record = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one()
    ref_id = user_record.referred_by_id
    if not ref_id:
        breakdown = order.pricing_breakdown or {}
        ref_code = breakdown.get("referral_code")
        if ref_code:
            ref_u = await find_referrer(db, ref_code)
            if ref_u and ref_u.id != user.id:
                ref_id = ref_u.id
                user_record.referred_by_id = ref_id

    if not ref_id or ref_id == user.id:
        return False

    referrer = (await db.execute(select(User).where(User.id == ref_id).with_for_update())).scalar_one_or_none()
    if not referrer:
        return False

    # 4. Award ₹10 (1000 paise) to the new customer
    user_record.wallet_balance_paise = (user_record.wallet_balance_paise or 0) + REFERRAL_BONUS_PAISE
    user.wallet_balance_paise = user_record.wallet_balance_paise
    audit(
        db,
        user,
        "referral_bonus_welcome",
        "user",
        str(user.id),
        {
            "amount_paise": REFERRAL_BONUS_PAISE,
            "referrer_id": referrer.id,
            "referrer_name": referrer.name,
            "order_number": order.order_number,
        },
        client_ip_addr,
    )
    db.add(Notification(
        user_id=user.id,
        title="Referral Welcome Reward Credited! 🍨",
        body=f"₹10 has been credited to your ICEPOPS wallet for placing your first order with {referrer.name}'s invite code!",
    ))

    # 5. Award ₹10 (1000 paise) to the referrer
    referrer.wallet_balance_paise = (referrer.wallet_balance_paise or 0) + REFERRAL_BONUS_PAISE
    audit(
        db,
        referrer,
        "referral_bonus",
        "user",
        str(referrer.id),
        {
            "referred_user_id": user.id,
            "referred_name": order.customer_name or user.name,
            "order_number": order.order_number,
            "amount_paise": REFERRAL_BONUS_PAISE,
        },
        client_ip_addr,
    )
    db.add(Notification(
        user_id=referrer.id,
        title="Friend Referral Bonus Credited! 🎁",
        body=f"Your friend {order.customer_name or user.name} placed their first order! ₹10 has been credited to your ICEPOPS wallet.",
    ))

    # Record in order pricing breakdown
    bd = dict(order.pricing_breakdown or {})
    bd["referral_awarded"] = {
        "customer_bonus_paise": REFERRAL_BONUS_PAISE,
        "referrer_bonus_paise": REFERRAL_BONUS_PAISE,
        "referrer_id": referrer.id,
        "referrer_name": referrer.name,
        "customer_id": user.id,
        "customer_name": order.customer_name or user.name,
        "revoked": False,
    }
    order.pricing_breakdown = bd
    flag_modified(order, "pricing_breakdown")

    return True


async def reverse_referral_bonus_if_awarded(
    db: AsyncSession,
    order: Order,
    client_ip_addr: str = "system",
) -> bool:
    """
    If a referral bonus was awarded on this order, reverse the ₹10
    from BOTH the customer and the referrer upon order cancellation.
    """
    bd = dict(order.pricing_breakdown or {})
    ref_info = bd.get("referral_awarded")

    # Check if already revoked
    if ref_info and ref_info.get("revoked"):
        return False

    already_reversed = (await db.execute(
        select(AuditLog.id).where(
            AuditLog.entity_id == order.order_number,
            AuditLog.action.in_(["referral_bonus_reversal", "referral_bonus_welcome_reversal"]),
        )
    )).scalars().all()
    if already_reversed:
        return False

    # Find audit logs awarded for this order
    all_ref_audits = (await db.execute(
        select(AuditLog).where(
            AuditLog.action.in_(["referral_bonus", "referral_bonus_welcome"]),
        )
    )).scalars().all()

    referrer_audits = [a for a in all_ref_audits if a.action == "referral_bonus" and (a.details or {}).get("order_number") == order.order_number]
    customer_audits = [a for a in all_ref_audits if a.action == "referral_bonus_welcome" and (a.details or {}).get("order_number") == order.order_number]

    if not referrer_audits and not customer_audits and not ref_info:
        return False

    # 1. Reverse Customer's ₹10 Welcome Bonus
    customer_id = order.user_id or (ref_info or {}).get("customer_id")
    if customer_id:
        cust_user = (await db.execute(select(User).where(User.id == customer_id).with_for_update())).scalar_one_or_none()
        if cust_user:
            cust_user.wallet_balance_paise = max(0, (cust_user.wallet_balance_paise or 0) - REFERRAL_BONUS_PAISE)
            audit(
                db,
                cust_user,
                "referral_bonus_welcome_reversal",
                "order",
                order.order_number,
                {
                    "amount_paise": REFERRAL_BONUS_PAISE,
                    "order_number": order.order_number,
                    "reason": "Order cancelled",
                },
                client_ip_addr,
            )
            db.add(Notification(
                user_id=cust_user.id,
                title="Welcome Referral Bonus Cancelled ⚠️",
                body=f"Your ₹{REFERRAL_BONUS_PAISE // 100} welcome referral bonus for Order #{order.order_number} has been cancelled because the order was cancelled.",
            ))

    # 2. Reverse Referrer's ₹10 Referral Bonus
    referrer_id = None
    friend_name = order.customer_name or "Friend"
    if referrer_audits:
        r_entry = referrer_audits[0]
        try:
            referrer_id = int(r_entry.entity_id)
        except (ValueError, TypeError):
            referrer_id = (r_entry.details or {}).get("referrer_id")
        friend_name = (r_entry.details or {}).get("referred_name", friend_name)
    elif ref_info:
        referrer_id = ref_info.get("referrer_id")

    if referrer_id:
        referrer_user = (await db.execute(select(User).where(User.id == referrer_id).with_for_update())).scalar_one_or_none()
        if referrer_user:
            referrer_user.wallet_balance_paise = max(0, (referrer_user.wallet_balance_paise or 0) - REFERRAL_BONUS_PAISE)
            audit(
                db,
                referrer_user,
                "referral_bonus_reversal",
                "order",
                order.order_number,
                {
                    "amount_paise": REFERRAL_BONUS_PAISE,
                    "order_number": order.order_number,
                    "referred_name": friend_name,
                    "reason": "Order cancelled",
                },
                client_ip_addr,
            )
            db.add(Notification(
                user_id=referrer_user.id,
                title="Friend Referral Bonus Cancelled ⚠️",
                body=f"Order #{order.order_number} by {friend_name} was cancelled. The ₹{REFERRAL_BONUS_PAISE // 100} referral bonus has been cancelled.",
            ))

    # Mark revoked on order pricing_breakdown
    if not ref_info:
        ref_info = {}
    ref_info["revoked"] = True
    ref_info["revoked_at"] = datetime.now(timezone.utc).isoformat()
    bd["referral_awarded"] = ref_info
    order.pricing_breakdown = bd
    flag_modified(order, "pricing_breakdown")

    return True
