from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import Address, Cart, CartItem, Notification, ProductVariant, User
from core.pricing import build_quote, public_quote
from core.security import get_optional_user, normalize_phone, rate_limit, require_user, validate_pincode

router = APIRouter(tags=["cart", "account"])


class CartLine(BaseModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=50)


class CartIn(BaseModel):
    items: list[CartLine] = Field(default_factory=list, max_length=50)


class LanguageIn(BaseModel):
    language: Literal["en", "te"]


@router.put("/account/language")
async def set_language(body: LanguageIn, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    user.language = body.language
    await db.commit()
    return {"language": user.language}


class QuoteIn(CartIn):
    coupon_code: Optional[str] = Field(None, max_length=30)
    fulfilment_type: Literal["delivery", "pickup"] = "delivery"
    pincode: Optional[str] = Field(None, max_length=6)
    use_loyalty_reward: bool = False


@router.post("/cart/quote")
async def quote(body: QuoteIn, user: Optional[User] = Depends(get_optional_user), db: AsyncSession = Depends(get_db)):
    q = await build_quote(db, user, body.items, body.coupon_code, body.fulfilment_type, body.pincode,
                          use_reward=body.use_loyalty_reward)
    return public_quote(q)


@router.get("/cart")
async def get_cart(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    cart = (await db.execute(select(Cart).where(Cart.user_id == user.id))).scalar_one_or_none()
    return {"items": [{"variant_id": i.variant_id, "quantity": i.quantity} for i in (cart.items if cart else [])]}


@router.put("/cart")
async def put_cart(body: CartIn, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    rate_limit(f"cart:{user.id}", 120, 60)
    merged: dict[int, int] = {}
    for it in body.items:
        merged[it.variant_id] = min(50, merged.get(it.variant_id, 0) + it.quantity)
    valid = set((await db.execute(select(ProductVariant.id).where(ProductVariant.id.in_(list(merged) or [0])))).scalars())
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    cart = (await db.execute(select(Cart).where(Cart.user_id == user.id))).scalar_one_or_none()
    if not cart:
        cart = Cart(user_id=user.id, items=[])
        db.add(cart)
        await db.flush()
    await db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    for vid, q in merged.items():
        if vid in valid:
            db.add(CartItem(cart_id=cart.id, variant_id=vid, quantity=q))
    await db.commit()
    return {"items": [{"variant_id": v, "quantity": q} for v, q in merged.items() if v in valid]}


class AddressIn(BaseModel):
    label: str = Field("Home", max_length=30)
    name: str = Field(min_length=2, max_length=80)
    phone: str
    line1: str = Field(min_length=3, max_length=200)
    line2: Optional[str] = Field(None, max_length=200)
    area: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=80)
    pincode: str
    instructions: Optional[str] = Field(None, max_length=300)
    is_default: bool = False

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return normalize_phone(v)

    @field_validator("pincode")
    @classmethod
    def _pin(cls, v):
        return validate_pincode(v)


def address_out(a: Address) -> dict:
    return {k: getattr(a, k) for k in ("id", "label", "name", "phone", "line1", "line2", "area", "city",
                                       "pincode", "instructions", "is_default")}


async def _own_address(db, user, address_id) -> Address:
    a = await db.get(Address, address_id)
    if not a or a.user_id != user.id:
        raise HTTPException(status_code=404, detail="Address not found")
    return a


@router.get("/account/addresses")
async def list_addresses(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Address).where(Address.user_id == user.id)
                             .order_by(Address.is_default.desc(), Address.id.desc()))).scalars()
    return [address_out(a) for a in rows]


@router.post("/account/addresses")
async def create_address(body: AddressIn, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    count = len((await db.execute(select(Address.id).where(Address.user_id == user.id))).all())
    if count >= 10:
        raise HTTPException(status_code=400, detail="You can save up to 10 addresses.")
    if body.is_default or count == 0:
        await db.execute(update(Address).where(Address.user_id == user.id).values(is_default=False))
    a = Address(user_id=user.id, **body.model_dump(exclude={"is_default"}), is_default=body.is_default or count == 0)
    db.add(a)
    await db.commit()
    return address_out(a)


@router.put("/account/addresses/{address_id}")
async def update_address(address_id: int, body: AddressIn, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    a = await _own_address(db, user, address_id)
    if body.is_default:
        await db.execute(update(Address).where(Address.user_id == user.id).values(is_default=False))
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    await db.commit()
    return address_out(a)


@router.delete("/account/addresses/{address_id}")
async def delete_address(address_id: int, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    a = await _own_address(db, user, address_id)
    await db.delete(a)
    await db.commit()
    return {"ok": True}


@router.get("/notifications")
async def notifications(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Notification).where(Notification.user_id == user.id)
                             .order_by(Notification.created_at.desc()).limit(50))).scalars().all()
    return {"unread": sum(1 for n in rows if not n.is_read),
            "items": [{"id": n.id, "title": n.title, "body": n.body, "order_number": n.order_number,
                       "is_read": n.is_read, "created_at": n.created_at.isoformat()} for n in rows]}


@router.post("/notifications/read-all")
async def read_all(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    await db.execute(update(Notification).where(Notification.user_id == user.id).values(is_read=True))
    await db.commit()
    return {"ok": True}
