import re
import secrets
from typing import Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import AuditLog, GiftCard, Order, Payment, User
from core.payments import rzp, rzp_call, rzp_keys
from core.referral import find_referrer
from core.security import audit, client_ip, get_optional_user, require_user
from core.store import get_settings

router = APIRouter(prefix="/giftcards", tags=["giftcards"])


class GiftCardPurchaseIn(BaseModel):
    sender_name: str = Field(min_length=2, max_length=80)
    recipient_name: str = Field(min_length=2, max_length=80)
    recipient_phone: Optional[str] = Field(None, max_length=15)
    recipient_email: Optional[str] = Field(None, max_length=255)
    message: Optional[str] = Field(None, max_length=300)
    amount_paise: int = Field(ge=10000, le=1000000)  # ₹100 to ₹10,000


class GiftCardVerifyIn(BaseModel):
    razorpay_order_id: str = Field(max_length=100)
    razorpay_payment_id: str = Field(max_length=100)
    razorpay_signature: str = Field(max_length=200)
    amount_paise: int = Field(ge=10000, le=1000000)
    sender_name: str = Field(min_length=2, max_length=80)
    recipient_name: str = Field(min_length=2, max_length=80)
    recipient_phone: Optional[str] = Field(None, max_length=15)
    recipient_email: Optional[str] = Field(None, max_length=255)
    message: Optional[str] = Field(None, max_length=300)


class GiftCardRedeemIn(BaseModel):
    code: str = Field(min_length=6, max_length=30)


@router.get("/check/{code}")
async def check_gift_card(code: str, db: AsyncSession = Depends(get_db)):
    """Check balance and validity of a gift voucher code."""
    clean_code = code.strip().upper()
    card = (await db.execute(select(GiftCard).where(GiftCard.code == clean_code))).scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Gift card not found. Please double-check the code.")
    if not card.is_active or card.balance_paise <= 0:
        raise HTTPException(status_code=400, detail="This gift card has already been fully redeemed.")

    return {
        "code": card.code,
        "sender_name": card.sender_name,
        "recipient_name": card.recipient_name,
        "amount_paise": card.amount_paise,
        "balance_paise": card.balance_paise,
        "is_active": card.is_active,
    }


@router.post("/razorpay/order")
async def create_giftcard_order(
    body: GiftCardPurchaseIn,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Create Razorpay order for digital gift voucher purchase."""
    receipt = f"GC-{secrets.token_hex(4).upper()}"
    ro = await rzp_call(
        rzp().order.create,
        {
            "amount": body.amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "notes": {
                "type": "gift_card",
                "sender_name": body.sender_name,
                "recipient_name": body.recipient_name,
                "recipient_phone": body.recipient_phone or "",
            },
        },
    )
    s = await get_settings(db)
    return {
        "key_id": rzp_keys()[0],
        "razorpay_order_id": ro["id"],
        "amount": body.amount_paise,
        "currency": "INR",
        "name": s.business_name or "ICEPOPS",
        "description": f"Gift Voucher for {body.recipient_name} (₹{body.amount_paise // 100})",
        "prefill": {
            "name": body.sender_name,
            "email": user.email if (user and not user.email.endswith("@customer.icepops.in")) else "",
            "contact": f"+91{user.phone}" if (user and user.phone) else "",
        },
    }


@router.post("/razorpay/verify")
async def verify_giftcard_payment(
    body: GiftCardVerifyIn,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify Razorpay payment and generate active gift voucher."""
    client = rzp()
    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": body.razorpay_order_id,
                "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature,
            }
        )
    except razorpay.errors.SignatureVerificationError:
        raise HTTPException(
            status_code=400,
            detail="Payment signature verification failed. If money was deducted, please contact support with reference: "
            + body.razorpay_payment_id,
        )

    rp = await rzp_call(client.payment.fetch, body.razorpay_payment_id)
    if rp.get("status") == "authorized":
        rp = await rzp_call(client.payment.capture, rp["id"], rp["amount"], {"currency": "INR"})
    if rp.get("status") != "captured":
        raise HTTPException(status_code=400, detail="Payment is not complete yet.")

    code = f"POPS-{secrets.token_hex(3).upper()}"
    card = GiftCard(
        code=code,
        sender_name=body.sender_name.strip(),
        recipient_name=body.recipient_name.strip(),
        recipient_phone=body.recipient_phone.strip() if body.recipient_phone else None,
        recipient_email=body.recipient_email.strip() if body.recipient_email else None,
        message=body.message.strip() if body.message else None,
        amount_paise=body.amount_paise,
        balance_paise=body.amount_paise,
        is_active=True,
    )
    db.add(card)
    audit(
        db,
        user,
        "giftcard_purchased",
        "gift_card",
        code,
        {
            "amount_paise": body.amount_paise,
            "razorpay_payment_id": body.razorpay_payment_id,
            "sender_name": body.sender_name,
            "recipient_name": body.recipient_name,
        },
        client_ip(request),
    )
    await db.commit()
    await db.refresh(card)

    return {
        "ok": True,
        "code": card.code,
        "amount_paise": card.amount_paise,
        "recipient_name": card.recipient_name,
        "sender_name": card.sender_name,
        "message": f"Payment successful! Gift voucher for ₹{card.amount_paise // 100} has been created. Share code {card.code} with {card.recipient_name}.",
    }


@router.post("/purchase")
async def purchase_gift_card(
    body: GiftCardPurchaseIn,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Direct purchase fallback (for admin/store issuing)."""
    # If not admin, require using the Razorpay payment endpoint
    if not user or "admin" not in user.role_names:
        raise HTTPException(
            status_code=400,
            detail="Online payment required for gift vouchers. Please complete checkout via Razorpay.",
        )

    code = f"POPS-{secrets.token_hex(3).upper()}"
    card = GiftCard(
        code=code,
        sender_name=body.sender_name.strip(),
        recipient_name=body.recipient_name.strip(),
        recipient_phone=body.recipient_phone.strip() if body.recipient_phone else None,
        recipient_email=body.recipient_email.strip() if body.recipient_email else None,
        message=body.message.strip() if body.message else None,
        amount_paise=body.amount_paise,
        balance_paise=body.amount_paise,
        is_active=True,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)

    return {
        "ok": True,
        "code": card.code,
        "amount_paise": card.amount_paise,
        "recipient_name": card.recipient_name,
        "sender_name": card.sender_name,
        "message": f"Gift card for ₹{card.amount_paise // 100} generated successfully! Share code {card.code} with {card.recipient_name}.",
    }


@router.post("/redeem")
async def redeem_gift_card(
    body: GiftCardRedeemIn,
    request: Request,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Redeem a gift card into the customer's wallet balance."""
    clean_code = body.code.strip().upper()
    card = (await db.execute(select(GiftCard).where(GiftCard.code == clean_code).with_for_update())).scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Invalid gift card code.")
    if not card.is_active or card.balance_paise <= 0:
        raise HTTPException(status_code=400, detail="This gift card has already been redeemed.")

    credit_amount = card.balance_paise
    user_record = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one()
    current_wallet = user_record.wallet_balance_paise or 0
    user_record.wallet_balance_paise = current_wallet + credit_amount

    card.balance_paise = 0
    card.is_active = False

    audit(db, user, "giftcard_redeemed", "gift_card", clean_code, {"amount_paise": credit_amount}, client_ip(request))
    await db.commit()

    return {
        "ok": True,
        "credited_paise": credit_amount,
        "new_wallet_balance_paise": user_record.wallet_balance_paise,
        "message": f"Success! ₹{credit_amount // 100} has been added to your ICEPOPS wallet.",
    }


@router.get("/wallet")
async def get_wallet_balance(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    """Fetch logged in customer's current wallet and referral balance."""
    user_record = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    if not user_record.referral_code:
        name_clean = re.sub(r"[^A-Za-z]", "", (user_record.name or "ICE").split()[0]).upper()
        if not name_clean:
            name_clean = "ICE"
        code = f"{name_clean[:6]}10"
        existing = (await db.execute(select(User.id).where(User.referral_code == code, User.id != user_record.id))).scalar_one_or_none()
        if existing:
            code = f"{name_clean[:5]}{user_record.id}10"
        user_record.referral_code = code
        await db.commit()

    return {
        "wallet_balance_paise": user_record.wallet_balance_paise or 0,
        "referral_code": user_record.referral_code,
    }


class ApplyReferralIn(BaseModel):
    code: str = Field(min_length=3, max_length=30)


@router.get("/referral")
async def get_referral_details(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    """Retrieve customer's unique referral code, shareable link and earnings stats."""
    user_record = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    code = user_record.referral_code
    if not code:
        name_clean = re.sub(r"[^A-Za-z]", "", (user_record.name or "ICE").split()[0]).upper()
        if not name_clean:
            name_clean = "ICE"
        code = f"{name_clean[:6]}10"
        existing = (await db.execute(select(User.id).where(User.referral_code == code, User.id != user_record.id))).scalar_one_or_none()
        if existing:
            code = f"{name_clean[:5]}{user_record.id}10"
        user_record.referral_code = code
        await db.commit()

    # 1. Fetch all users who signed up or linked this user's referral code
    referred_users = (await db.execute(
        select(User).where(User.referred_by_id == user.id).order_by(User.created_at.desc())
    )).scalars().all()

    # 2. Fetch referral audit entries and reversals for this user
    referral_audits = (await db.execute(
        select(AuditLog).where(
            AuditLog.action == "referral_bonus",
            AuditLog.entity_id == str(user.id),
        ).order_by(AuditLog.created_at.desc())
    )).scalars().all()

    referral_reversals = (await db.execute(
        select(AuditLog).where(
            AuditLog.action == "referral_bonus_reversal",
            AuditLog.actor_user_id == user.id,
        )
    )).scalars().all()
    reversed_orders = {r.entity_id for r in referral_reversals}

    audit_by_user_id = {}
    for a in referral_audits:
        uid = (a.details or {}).get("referred_user_id")
        if uid:
            audit_by_user_id[uid] = a

    def mask_phone(phone: Optional[str]) -> str:
        if not phone:
            return ""
        clean = phone.replace("+91", "").strip()
        if len(clean) >= 10:
            return f"+91 {clean[:3]}••••{clean[-3:]}"
        return f"{clean[:2]}••••"

    def mask_email(email: Optional[str]) -> str:
        if not email:
            return ""
        parts = email.split("@")
        name = parts[0]
        domain = parts[1] if len(parts) > 1 else ""
        if len(name) <= 2:
            masked_name = f"{name[0]}*"
        else:
            masked_name = f"{name[:2]}••••{name[-1]}"
        return f"{masked_name}@{domain}"

    completed_referrals = []
    pending_referrals = []

    for ru in referred_users:
        audit_entry = audit_by_user_id.get(ru.id)
        order_num = (audit_entry.details or {}).get("order_number") if audit_entry else None
        is_reversed = order_num in reversed_orders if order_num else False

        # Check if this user has an active non-cancelled order
        has_order = (await db.execute(
            select(Order).where(
                Order.user_id == ru.id,
                Order.status.not_in(["cancelled", "refund_pending", "refunded"]),
            ).order_by(Order.created_at.desc())
        )).scalars().first()

        if audit_entry and not is_reversed and has_order:
            completed_referrals.append({
                "id": ru.id,
                "name": ru.name,
                "phone_masked": mask_phone(ru.phone),
                "email_masked": mask_email(ru.email),
                "status": "completed",
                "status_label": "Completed (₹10 Credited)",
                "order_number": order_num,
                "earned_paise": (audit_entry.details or {}).get("amount_paise", 1000),
                "date": audit_entry.created_at.isoformat() if audit_entry.created_at else (ru.created_at.isoformat() if ru.created_at else None),
            })
        elif has_order:
            completed_referrals.append({
                "id": ru.id,
                "name": ru.name,
                "phone_masked": mask_phone(ru.phone),
                "email_masked": mask_email(ru.email),
                "status": "completed",
                "status_label": "Completed (₹10 Credited)",
                "order_number": has_order.order_number,
                "earned_paise": 1000,
                "date": has_order.created_at.isoformat() if has_order.created_at else None,
            })
        else:
            pending_referrals.append({
                "id": ru.id,
                "name": ru.name,
                "phone_masked": mask_phone(ru.phone),
                "email_masked": mask_email(ru.email),
                "status": "pending",
                "status_label": "Pending (Awaiting 1st Order)",
                "order_number": None,
                "earned_paise": 0,
                "date": ru.created_at.isoformat() if ru.created_at else None,
            })

    # Include any legacy audit entries where user was deleted or entered as guest (if not reversed)
    known_completed_ids = {c["id"] for c in completed_referrals}
    for a in referral_audits:
        order_num = (a.details or {}).get("order_number")
        if order_num in reversed_orders:
            continue
        uid = (a.details or {}).get("referred_user_id")
        if uid not in known_completed_ids:
            completed_referrals.append({
                "id": uid or a.id,
                "name": (a.details or {}).get("referred_name", "Friend"),
                "phone_masked": "",
                "email_masked": "",
                "status": "completed",
                "status_label": "Completed (₹10 Credited)",
                "order_number": order_num,
                "earned_paise": (a.details or {}).get("amount_paise", 1000),
                "date": a.created_at.isoformat() if a.created_at else None,
            })

    total_referrals = len(completed_referrals) + len(pending_referrals)
    completed_count = len(completed_referrals)
    pending_count = len(pending_referrals)
    total_earned_paise = sum(c["earned_paise"] for c in completed_referrals)

    # Check if this user has already completed/placed an order
    orders_count = (await db.execute(
        select(func.count(Order.id)).where(
            Order.user_id == user.id,
            Order.status.not_in(["cancelled", "refund_pending", "refunded"]),
        )
    )).scalar() or 0
    has_completed_order = orders_count > 0

    referred_by_name = None
    referred_by_code = None
    if user_record.referred_by_id:
        ref_u = (await db.execute(select(User).where(User.id == user_record.referred_by_id))).scalar_one_or_none()
        if ref_u:
            referred_by_name = ref_u.name
            referred_by_code = ref_u.referral_code

    return {
        "referral_code": code,
        "reward_per_referral_paise": 1000,
        "total_referrals": total_referrals,
        "completed_count": completed_count,
        "pending_count": pending_count,
        "total_earned_paise": total_earned_paise,
        "completed_referrals": completed_referrals,
        "pending_referrals": pending_referrals,
        "recent_referrals": completed_referrals[:10],
        "has_completed_order": has_completed_order,
        "referred_by_id": user_record.referred_by_id,
        "referred_by_name": referred_by_name,
        "referred_by_code": referred_by_code,
    }


@router.post("/referral/apply")
async def apply_referral_code(
    body: ApplyReferralIn,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Link a friend's referral code to current customer before placing their first order."""
    user_record = (await db.execute(select(User).where(User.id == user.id).with_for_update())).scalar_one()

    # Once a referral code is linked, it is fixed and cannot be changed or edited
    if user_record.referred_by_id:
        raise HTTPException(
            status_code=400,
            detail="A referral code has already been linked to your account and cannot be modified.",
        )

    # Check if first order already placed
    orders_count = (await db.execute(
        select(func.count(Order.id)).where(
            Order.user_id == user.id,
            Order.status.not_in(["cancelled", "refund_pending", "refunded"]),
        )
    )).scalar() or 0
    if orders_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Referral codes can only be linked before placing your first order.",
        )

    ref_clean = body.code.strip().upper()
    referrer = await find_referrer(db, ref_clean)
    if not referrer:
        raise HTTPException(status_code=404, detail=f"Referral code '{ref_clean}' was not found.")
    if referrer.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot use your own referral code.")

    user_record.referred_by_id = referrer.id
    await db.commit()

    return {
        "ok": True,
        "message": f"Referral code '{ref_clean}' linked! You and {referrer.name} will both receive ₹10 in your wallet after your first order.",
        "referred_by_id": referrer.id,
        "referred_by_name": referrer.name,
        "referred_by_code": referrer.referral_code or ref_clean,
    }


@router.delete("/referral/apply")
async def remove_referral_code(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Referral codes are fixed once entered and cannot be edited or removed."""
    raise HTTPException(
        status_code=400,
        detail="Referral codes are permanently locked once entered and cannot be edited or removed.",
    )


@router.get("/my-vouchers")
async def list_my_vouchers(
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """List gift vouchers strictly belonging to the current customer (purchased, redeemed, or addressed to them)."""
    if not user:
        return []

    # 1. Gift card codes explicitly purchased or redeemed by this user account
    user_codes = (await db.execute(
        select(AuditLog.entity_id).where(
            AuditLog.actor_user_id == user.id,
            AuditLog.action.in_(["giftcard_purchased", "giftcard_redeemed"]),
        )
    )).scalars().all()

    conditions = []
    # 2. Match exact recipient email (only for real accounts, not dummy @customer.icepops.in)
    if user.email and not user.email.endswith("@customer.icepops.in"):
        conditions.append(func.lower(GiftCard.recipient_email) == user.email.lower().strip())

    # 3. Match exact recipient phone
    if user.phone:
        clean_phone = user.phone.replace("+", "").replace("-", "").replace(" ", "").strip()
        conditions.append(GiftCard.recipient_phone == user.phone)
        if len(clean_phone) >= 10:
            conditions.append(GiftCard.recipient_phone.endswith(clean_phone[-10:]))

    # 4. Codes in audit logs
    valid_codes = [c for c in user_codes if c and str(c).strip()]
    if valid_codes:
        conditions.append(GiftCard.code.in_(valid_codes))

    if not conditions:
        return []

    cards = (await db.execute(
        select(GiftCard).where(or_(*conditions)).order_by(GiftCard.created_at.desc())
    )).scalars().all()

    return [
        {
            "id": c.id,
            "code": c.code,
            "amount_paise": c.amount_paise,
            "balance_paise": c.balance_paise,
            "sender_name": c.sender_name,
            "recipient_name": c.recipient_name,
            "recipient_phone": c.recipient_phone,
            "recipient_email": c.recipient_email,
            "message": c.message,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in cards
    ]


@router.get("/wallet/history")
async def wallet_history(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve complete audit ledger of wallet credits and debits."""
    transactions = []

    # 1. Credits: Gift card redemptions, scratch card cashbacks, and referral bonuses from AuditLog
    credits = (await db.execute(
        select(AuditLog).where(
            or_(
                # Redemptions, cashbacks, welcome bonus, and order refunds for this user
                and_(
                    AuditLog.actor_user_id == user.id,
                    AuditLog.action.in_(["giftcard_redeemed", "scratch_card_reward", "referral_bonus_welcome", "wallet_order_refund"]),
                ),
                # Friend referral bonus where this user is the referrer
                and_(
                    AuditLog.action == "referral_bonus",
                    or_(
                        AuditLog.entity_id == str(user.id),
                        AuditLog.actor_user_id == user.id,
                    ),
                ),
            ),
        ).order_by(AuditLog.created_at.desc())
    )).scalars().all()

    for r in credits:
        amount = (r.details or {}).get("amount_paise", 0)
        # Skip ?0 non-cash perks (like loyalty stamps) from cash wallet passbook
        if amount <= 0:
            continue

        if r.action == "scratch_card_reward":
            reward_title = (r.details or {}).get("title") or f"Mystery Scratch Card ({r.entity_id})"
            title = reward_title
            desc = "Won from post-payment scratch card"
        elif r.action == "referral_bonus":
            # Strict isolation: Only show to the referrer who received the ?10
            referred_user_id = (r.details or {}).get("referred_user_id")
            if referred_user_id == user.id:
                # This was the customer who made the purchase, not the referrer!
                continue
            friend = (r.details or {}).get("referred_name", "Friend")
            title = f"Friend Referral Bonus ({friend}) 🎁"
            desc = "Credited when your friend placed an order"
        elif r.action == "referral_bonus_welcome":
            # Strict isolation: Only show to the customer who got welcomed
            if r.actor_user_id != user.id:
                continue
            referrer_name = (r.details or {}).get("referrer_name", "a friend")
            title = "Welcome Referral Bonus 🍨"
            desc = f"Credited on your first order with {referrer_name}'s code"
        elif r.action == "wallet_order_refund":
            title = f"Wallet Payment Refund (#{r.entity_id}) 🍨"
            desc = "Refunded for cancelled order"
        else:
            title = f"Gift Voucher Redeemed ({r.entity_id})"
            desc = "Added to ICEPOPS digital wallet"

        transactions.append({
            "id": f"credit-{r.id}",
            "type": "credit",
            "title": title,
            "description": desc,
            "amount_paise": amount,
            "reference": r.entity_id,
            "status": "completed",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    # 2. Debits: Orders paid via wallet AND reversals (scratch cards, referral bonuses)
    reversals = (await db.execute(
        select(AuditLog).where(
            AuditLog.actor_user_id == user.id,
            AuditLog.action.in_(["scratch_card_reversal", "referral_bonus_reversal", "referral_bonus_welcome_reversal"]),
        ).order_by(AuditLog.created_at.desc())
    )).scalars().all()

    for r in reversals:
        amount = (r.details or {}).get("amount_paise", 0)
        if amount <= 0:
            continue
        if r.action == "referral_bonus_reversal":
            # Only show to referrer
            if str(r.actor_user_id) != str(user.id):
                continue
            friend = (r.details or {}).get("referred_name", "Friend")
            title = f"Friend Referral Bonus Cancelled ({friend}) ⚠️"
            desc = "Reversed due to order cancellation"
        elif r.action == "referral_bonus_welcome_reversal":
            # Only show to customer
            if str(r.actor_user_id) != str(user.id):
                continue
            title = f"Welcome Referral Bonus Cancelled (#{r.entity_id}) ⚠️"
            desc = "Reversed due to order cancellation"
        else:
            title = f"Scratch Card Reward Cancelled (#{r.entity_id}) ⚠️"
            desc = "Reversed due to order cancellation"

        transactions.append({
            "id": f"debit-reversal-{r.id}",
            "type": "debit",
            "title": title,
            "description": desc,
            "amount_paise": amount,
            "reference": r.entity_id,
            "status": "completed",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    orders_paid_wallet = (await db.execute(
        select(Payment, Order)
        .join(Order, Order.id == Payment.order_id)
        .where(
            Order.user_id == user.id,
            Payment.provider == "wallet",
            Payment.status == "paid",
        )
        .order_by(Payment.created_at.desc())
    )).all()

    for p, o in orders_paid_wallet:
        transactions.append({
            "id": f"debit-{p.id}",
            "type": "debit",
            "title": f"Order #{o.order_number}",
            "description": "Paid using ICEPOPS wallet",
            "amount_paise": p.amount_paise,
            "reference": o.order_number,
            "status": "completed",
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })

    # Sort all by created_at descending
    transactions.sort(key=lambda t: t.get("created_at") or "", reverse=True)
    return transactions
