from datetime import datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import Category, Coupon, CouponRedemption, DeliveryZone, OpeningHour, PolicyPage, Product, Promotion
from core.payments import online_ready
from core.store import WEEKDAYS, get_settings, paise, store_status

IST = ZoneInfo("Asia/Kolkata")

router = APIRouter(tags=["catalog"])


def product_out(p: Product) -> dict:
    variants = [v for v in p.variants if v.is_active]
    return {
        "id": p.id, "name": p.name, "slug": p.slug, "description": p.description, "image_url": p.image_url,
        "name_te": p.name_te, "description_te": p.description_te,
        "ingredients": p.ingredients, "allergens": p.allergens or [], "is_featured": p.is_featured,
        "is_bestseller": p.is_bestseller, "promo_eligible": p.promo_eligible,
        "category": {"id": p.category.id, "name": p.category.name, "slug": p.category.slug, "is_popsicle": p.category.is_popsicle},
        "variants": [{"id": v.id, "name": v.name, "price_paise": v.price_paise,
                      "in_stock": (not v.inventory.track_stock) or v.inventory.quantity > 0,
                      "low_stock": v.inventory.track_stock and 0 < v.inventory.quantity <= v.inventory.low_stock_threshold}
                     for v in variants if v.inventory],
        "in_stock": any((not v.inventory.track_stock) or v.inventory.quantity > 0 for v in variants if v.inventory),
    }


@router.get("/catalog/categories")
async def categories(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order))).scalars()
    return [{"id": c.id, "name": c.name, "slug": c.slug, "description": c.description, "image_url": c.image_url,
             "is_popsicle": c.is_popsicle} for c in rows]


@router.get("/catalog/products")
async def products(category: Optional[str] = None, q: Optional[str] = None, featured: bool = False,
                   bestseller: bool = False, db: AsyncSession = Depends(get_db)):
    stmt = (select(Product).join(Category).where(Product.is_active.is_(True), Category.is_active.is_(True))
            .order_by(Category.sort_order, Product.sort_order))
    if category:
        stmt = stmt.where(Category.slug == category)
    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q[:50]}%"))
    if featured:
        stmt = stmt.where(Product.is_featured.is_(True))
    if bestseller:
        stmt = stmt.where(Product.is_bestseller.is_(True))
    return [product_out(p) for p in (await db.execute(stmt)).scalars()]


@router.get("/catalog/products/{slug}")
async def product_detail(slug: str, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Product).where(Product.slug == slug, Product.is_active.is_(True)))).scalar_one_or_none()
    if not p or not p.category.is_active:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_out(p)


@router.get("/store/info")
async def store_info(db: AsyncSession = Depends(get_db)):
    s = await get_settings(db)
    hours = (await db.execute(select(OpeningHour).order_by(OpeningHour.weekday))).scalars()
    promos = (await db.execute(select(Promotion).where(Promotion.is_enabled.is_(True)))).scalars()
    zones = (await db.execute(select(DeliveryZone).where(DeliveryZone.is_active.is_(True)).order_by(DeliveryZone.pincode))).scalars()
    return {
        "business_name": s.business_name, "tagline": s.tagline, "logo_url": s.logo_url, "phone": s.phone,
        "whatsapp": s.whatsapp, "email": s.email, "address_line": s.address_line, "city": s.city, "state": s.state,
        "pincode": s.pincode, "map_embed_url": s.map_embed_url, "fssai_number": s.fssai_number, "gstin": s.gstin,
        "pickup_enabled": s.pickup_enabled, "delivery_enabled": s.delivery_enabled,
        "default_delivery_fee_paise": s.default_delivery_fee_paise, "min_delivery_order_paise": s.min_delivery_order_paise,
        "allow_offer_stacking": s.allow_offer_stacking,
        "payment_methods": [{**m, "enabled": m.get("enabled") and (m.get("code") != "online" or online_ready())}
                            for m in (s.payment_methods or [])],
        "online_payments_ready": online_ready(), "testimonials": s.testimonials or [],
        "status": await store_status(db),
        "hours": [{"weekday": h.weekday, "day": WEEKDAYS[h.weekday], "open": h.open_time.strftime("%H:%M"),
                   "close": h.close_time.strftime("%H:%M"), "is_closed": h.is_closed} for h in hours],
        "promotions": [{"code": p.code, "name": p.name, "description": p.description, "config": p.config} for p in promos],
        "delivery_pincodes": [{"pincode": z.pincode, "name": z.name} for z in zones],
    }


@router.get("/coupons/available")
async def available_coupons(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    used = (select(CouponRedemption.coupon_id, func.count(CouponRedemption.id).label("n"))
            .where(CouponRedemption.status == "applied").group_by(CouponRedemption.coupon_id).subquery())
    rows = (await db.execute(select(Coupon, used.c.n).outerjoin(used, used.c.coupon_id == Coupon.id).where(
        Coupon.is_active.is_(True), or_(Coupon.starts_at.is_(None), Coupon.starts_at <= now),
        or_(Coupon.ends_at.is_(None), Coupon.ends_at > now)).order_by(Coupon.min_order_paise))).all()
    out = []
    for c, n in rows:
        if c.usage_limit is not None and (n or 0) >= c.usage_limit:
            continue
        title = f"{c.discount_value}% off" if c.discount_type == "percent" else f"{paise(c.discount_value)} off"
        conds = [f"On orders of {paise(c.min_order_paise)} or more" if c.min_order_paise else "No minimum order"]
        if c.discount_type == "percent" and c.max_discount_paise:
            conds.append(f"Maximum discount {paise(c.max_discount_paise)}")
        if c.new_customers_only:
            conds.append("New customers only")
        conds.append("Once per customer" if c.per_user_limit == 1 else f"Up to {c.per_user_limit} times per customer")
        if c.ends_at:
            c_ends = c.ends_at.replace(tzinfo=timezone.utc) if c.ends_at.tzinfo is None else c.ends_at
            conds.append(f"Valid till {c_ends.astimezone(IST).strftime('%d %b %Y')}")
        conds.append("Can't be combined with other offers")
        out.append({"code": c.code, "title": title, "description": c.description, "min_order_paise": c.min_order_paise,
                    "conditions": conds})
    return out


@router.get("/policies")
async def policies(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(PolicyPage).order_by(PolicyPage.id))).scalars()
    return [{"slug": p.slug, "title": p.title} for p in rows]


@router.get("/policies/{slug}")
async def policy(slug: str, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(PolicyPage).where(PolicyPage.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Page not found")
    return {"slug": p.slug, "title": p.title, "content": p.content, "updated_at": p.updated_at.isoformat()}
