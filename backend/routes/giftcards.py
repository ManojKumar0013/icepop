import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import GiftCard, User
from core.security import audit, client_ip, get_optional_user, require_user

router = APIRouter(prefix="/giftcards", tags=["giftcards"])


class GiftCardPurchaseIn(BaseModel):
    sender_name: str = Field(min_length=2, max_length=80)
    recipient_name: str = Field(min_length=2, max_length=80)
    recipient_phone: Optional[str] = Field(None, max_length=15)
    recipient_email: Optional[str] = Field(None, max_length=255)
    message: Optional[str] = Field(None, max_length=300)
    amount_paise: int = Field(ge=10000, le=1000000)  # ₹100 to ₹10,000


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


@router.post("/purchase")
async def purchase_gift_card(
    body: GiftCardPurchaseIn,
    request: Request,
    user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Purchase a digital gift voucher with instant code generation."""
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
