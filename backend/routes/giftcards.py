import secrets
from typing import Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import AuditLog, GiftCard, Order, Payment, User
from core.payments import rzp, rzp_call, rzp_keys
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
    return {
        "wallet_balance_paise": user_record.wallet_balance_paise or 0,
        "referral_code": user_record.referral_code,
    }


@router.get("/my-vouchers")
async def list_my_vouchers(
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """List gift vouchers associated with current customer, or all if admin."""
    if not user:
        return []

    if "admin" in user.role_names:
        cards = (await db.execute(select(GiftCard).order_by(GiftCard.created_at.desc()))).scalars().all()
    else:
        user_codes = (await db.execute(
            select(AuditLog.entity_id).where(
                AuditLog.actor_user_id == user.id,
                AuditLog.action.in_(["giftcard_purchased", "giftcard_redeemed"]),
            )
        )).scalars().all()

        conditions = []
        name_clean = (user.name or "").strip().lower()
        if name_clean:
            conditions.append(func.lower(GiftCard.sender_name) == name_clean)
            conditions.append(func.lower(GiftCard.recipient_name) == name_clean)
            first_name = name_clean.split()[0]
            if len(first_name) >= 3:
                conditions.append(func.lower(GiftCard.sender_name).contains(first_name))
                conditions.append(func.lower(GiftCard.recipient_name).contains(first_name))

        if user.email and not user.email.endswith("@customer.icepops.in"):
            conditions.append(func.lower(GiftCard.recipient_email) == user.email.lower().strip())
        if user.phone:
            clean_phone = user.phone.replace("+", "").replace("-", "").replace(" ", "")
            conditions.append(GiftCard.recipient_phone == user.phone)
            conditions.append(GiftCard.recipient_phone == clean_phone)
        if user_codes:
            valid_codes = [c for c in user_codes if c]
            if valid_codes:
                conditions.append(GiftCard.code.in_(valid_codes))

        if conditions:
            cards = (await db.execute(
                select(GiftCard).where(or_(*conditions)).order_by(GiftCard.created_at.desc())
            )).scalars().all()
        else:
            cards = []

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

    # 1. Credits: Gift card redemptions from AuditLog
    redemptions = (await db.execute(
        select(AuditLog).where(
            AuditLog.actor_user_id == user.id,
            AuditLog.action == "giftcard_redeemed",
        ).order_by(AuditLog.created_at.desc())
    )).scalars().all()

    for r in redemptions:
        amount = (r.details or {}).get("amount_paise", 0)
        transactions.append({
            "id": f"credit-{r.id}",
            "type": "credit",
            "title": f"Gift Voucher Redeemed ({r.entity_id})",
            "description": "Added to ICEPOPS digital wallet",
            "amount_paise": amount,
            "reference": r.entity_id,
            "status": "completed",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    # 2. Debits: Orders paid via wallet from Payment table
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
