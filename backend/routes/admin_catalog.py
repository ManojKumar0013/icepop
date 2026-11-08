import re
import secrets
import uuid
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import (
    Category, Coupon, CouponCategory, CouponProduct, CouponRedemption, Inventory, InventoryMovement, Order,
    OrderItem, Product, ProductVariant, UploadedFile, User,
)
from core.security import audit, client_ip, require_admin
from core.storage import APP_NAME, get_object, put_object

router = APIRouter(tags=["admin-catalog"])
IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_IMAGE = 5 * 1024 * 1024
IMG_URL_RE = re.compile(r"^(/images/[\w.-]+|/api/files/[\w./-]+|https://[^\s\"'<>]+)$")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower().replace("&", "and")).strip("-")[:100] or "item"


def _check_image_url(v):
    if v and not IMG_URL_RE.match(v):
        raise ValueError("Image must be an uploaded image or an https link")
    return v or None


@router.post("/admin/uploads")
async def upload_image(request: Request, file: UploadFile = File(...), admin: User = Depends(require_admin),
                       db: AsyncSession = Depends(get_db)):
    ext = IMAGE_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status_code=400, detail="Please upload a JPG, PNG or WebP image.")
    data = await file.read(MAX_IMAGE + 1)
    if len(data) > MAX_IMAGE:
        raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller.")
    magic_ok = data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")
    if not magic_ok:
        raise HTTPException(status_code=400, detail="This file doesn't look like a valid image.")
    path = f"{APP_NAME}/products/{uuid.uuid4().hex}.{ext}"
    try:
        result = await put_object(path, data, file.content_type)
    except Exception:
        raise HTTPException(status_code=502, detail="Image upload failed. Please try again.")
    db.add(UploadedFile(storage_path=result["path"], original_filename=(file.filename or "")[:200],
                        content_type=file.content_type, size=len(data), uploaded_by=admin.id))
    audit(db, admin, "image_uploaded", "file", result["path"], {"size": len(data)}, client_ip(request))
    await db.commit()
    return {"url": f"/api/files/{result['path']}"}


@router.get("/files/{path:path}")
async def serve_file(path: str, db: AsyncSession = Depends(get_db)):
    rec = (await db.execute(select(UploadedFile).where(UploadedFile.storage_path == path,
                                                      UploadedFile.is_deleted.is_(False)))).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data, _ = await get_object(path)
    except Exception:
        raise HTTPException(status_code=502, detail="Image temporarily unavailable")
    return Response(content=data, media_type=rec.content_type,
                    headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})


# ---------- categories ----------
class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(None, max_length=500)
    image_url: Optional[str] = Field(None, max_length=500)
    is_popsicle: bool = False
    sort_order: int = Field(0, ge=0, le=999)
    is_active: bool = True

    @field_validator("image_url")
    @classmethod
    def _img(cls, v):
        return _check_image_url(v)


def category_out(c: Category) -> dict:
    return {k: getattr(c, k) for k in ("id", "name", "slug", "description", "image_url", "is_popsicle", "sort_order", "is_active")}


@router.get("/admin/categories")
async def admin_categories(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return [category_out(c) for c in (await db.execute(select(Category).order_by(Category.sort_order, Category.id))).scalars()]


async def _unique_slug(db, model, base: str, exclude_id=None) -> str:
    slug, n = base, 2
    while True:
        stmt = select(model.id).where(model.slug == slug)
        if exclude_id:
            stmt = stmt.where(model.id != exclude_id)
        if not (await db.execute(stmt)).first():
            return slug
        slug, n = f"{base}-{n}", n + 1


@router.post("/admin/categories")
async def create_category(body: CategoryIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    c = Category(**body.model_dump(), slug=await _unique_slug(db, Category, slugify(body.name)))
    db.add(c)
    await db.flush()
    audit(db, admin, "category_created", "category", c.id, body.model_dump(), client_ip(request))
    await db.commit()
    return category_out(c)


@router.put("/admin/categories/{cid}")
async def update_category(cid: int, body: CategoryIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    c = await db.get(Category, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    audit(db, admin, "category_updated", "category", cid, body.model_dump(), client_ip(request))
    await db.commit()
    return category_out(c)


# ---------- products ----------
class VariantIn(BaseModel):
    id: Optional[int] = None
    name: str = Field(min_length=1, max_length=80)
    price_paise: int = Field(ge=0, le=10_000_000)
    is_active: bool = True
    stock: int = Field(ge=0, le=100_000)
    track_stock: bool = True
    low_stock_threshold: int = Field(5, ge=0, le=10_000)


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category_id: int
    description: str = Field("", max_length=1000)
    name_te: Optional[str] = Field(None, max_length=120)
    description_te: Optional[str] = Field(None, max_length=1000)
    image_url: Optional[str] = Field(None, max_length=500)
    ingredients: Optional[str] = Field(None, max_length=1000)
    allergens: list[str] = Field(default_factory=list, max_length=15)
    is_featured: bool = False
    is_bestseller: bool = False
    promo_eligible: bool = True
    is_active: bool = True
    sort_order: int = Field(0, ge=0, le=9999)
    variants: list[VariantIn] = Field(min_length=1, max_length=12)

    @field_validator("image_url")
    @classmethod
    def _img(cls, v):
        return _check_image_url(v)

    @field_validator("allergens")
    @classmethod
    def _allergens(cls, v):
        return [a.strip()[:30] for a in v if a.strip()]


def admin_product_out(p: Product) -> dict:
    return {
        "id": p.id, "name": p.name, "slug": p.slug, "category_id": p.category_id, "category_name": p.category.name,
        "description": p.description, "name_te": p.name_te, "description_te": p.description_te,
        "image_url": p.image_url, "ingredients": p.ingredients, "allergens": p.allergens or [],
        "is_featured": p.is_featured, "is_bestseller": p.is_bestseller, "promo_eligible": p.promo_eligible,
        "is_active": p.is_active, "sort_order": p.sort_order,
        "variants": [{"id": v.id, "name": v.name, "price_paise": v.price_paise, "sku": v.sku, "is_active": v.is_active,
                      "stock": v.inventory.quantity if v.inventory else 0,
                      "track_stock": v.inventory.track_stock if v.inventory else True,
                      "low_stock_threshold": v.inventory.low_stock_threshold if v.inventory else 5} for v in p.variants],
    }


@router.get("/admin/products")
async def admin_products(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Product).order_by(Product.category_id, Product.sort_order, Product.id))).scalars()
    return [admin_product_out(p) for p in rows]


async def _apply_variants(db, p: Product, variants: list[VariantIn], admin: User):
    existing = {v.id: v for v in p.variants}
    keep = set()
    for i, vin in enumerate(variants):
        v = existing.get(vin.id) if vin.id else None
        if vin.id and not v:
            raise HTTPException(status_code=400, detail="Unknown size/variant in request.")
        if not v:
            base = f"{p.slug[:40]}-{slugify(vin.name)[:20]}"
            sku = base if not (await db.execute(select(ProductVariant.id).where(ProductVariant.sku == base))).first() else f"{base}-{secrets.token_hex(2)}"
            v = ProductVariant(product_id=p.id, name=vin.name, price_paise=vin.price_paise, sku=sku, sort_order=i, is_active=vin.is_active)
            db.add(v)
            await db.flush()
            inv = Inventory(variant_id=v.id, quantity=0, track_stock=vin.track_stock, low_stock_threshold=vin.low_stock_threshold)
            db.add(inv)
        else:
            v.name, v.price_paise, v.sort_order, v.is_active = vin.name, vin.price_paise, i, vin.is_active
            inv = (await db.execute(select(Inventory).where(Inventory.variant_id == v.id).with_for_update())).scalar_one()
            inv.track_stock, inv.low_stock_threshold = vin.track_stock, vin.low_stock_threshold
        if inv.quantity != vin.stock:
            db.add(InventoryMovement(variant_id=v.id, change=vin.stock - inv.quantity, reason="manual_adjust", actor_user_id=admin.id))
            inv.quantity = vin.stock
        keep.add(v.id)
    for vid, v in existing.items():
        if vid not in keep:
            v.is_active = False


async def _load_product(db, pid) -> Product:
    p = (await db.execute(select(Product).where(Product.id == pid).execution_options(populate_existing=True))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return p


@router.post("/admin/products")
async def create_product(body: ProductIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if not await db.get(Category, body.category_id):
        raise HTTPException(status_code=400, detail="Choose a valid category.")
    p = Product(**body.model_dump(exclude={"variants"}), slug=await _unique_slug(db, Product, slugify(body.name)))
    db.add(p)
    await db.flush()
    p = await _load_product(db, p.id)
    await _apply_variants(db, p, body.variants, admin)
    audit(db, admin, "product_created", "product", p.id, {"name": p.name}, client_ip(request))
    await db.commit()
    return admin_product_out(await _load_product(db, p.id))


@router.put("/admin/products/{pid}")
async def update_product(pid: int, body: ProductIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    p = await _load_product(db, pid)
    if not await db.get(Category, body.category_id):
        raise HTTPException(status_code=400, detail="Choose a valid category.")
    before = admin_product_out(p)
    for k, v in body.model_dump(exclude={"variants"}).items():
        setattr(p, k, v)
    await _apply_variants(db, p, body.variants, admin)
    audit(db, admin, "product_updated", "product", pid, {"before": {k: before[k] for k in ("name", "is_active", "variants")},
                                                         "after": body.model_dump(include={"name", "is_active", "variants"})}, client_ip(request))
    await db.commit()
    return admin_product_out(await _load_product(db, pid))


@router.delete("/admin/products/{pid}")
async def delete_product(pid: int, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    p = await _load_product(db, pid)
    if p.is_active:
        raise HTTPException(status_code=409, detail="Hide this product from the menu first, then delete it.")
    if (await db.execute(select(OrderItem.id).where(OrderItem.product_id == pid).limit(1))).first():
        raise HTTPException(status_code=409, detail="This product has past orders, so it can't be deleted. Deactivate it instead.")
    audit(db, admin, "product_deleted", "product", pid, {"name": p.name}, client_ip(request))
    for v in p.variants:
        await db.execute(delete(InventoryMovement).where(InventoryMovement.variant_id == v.id))
    await db.execute(delete(Product).where(Product.id == pid))
    await db.commit()
    return {"ok": True}


# ---------- coupons ----------
class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=30)
    description: str = Field("", max_length=200)
    discount_type: Literal["percent", "flat"]
    discount_value: int = Field(ge=1, le=100_000)
    min_order_paise: int = Field(0, ge=0, le=10_000_000)
    max_discount_paise: Optional[int] = Field(None, ge=0, le=10_000_000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    usage_limit: Optional[int] = Field(None, ge=1, le=1_000_000)
    per_user_limit: int = Field(1, ge=1, le=100)
    new_customers_only: bool = False
    is_active: bool = True
    product_ids: list[int] = Field(default_factory=list, max_length=200)
    category_ids: list[int] = Field(default_factory=list, max_length=50)

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z0-9_-]{3,30}", v):
            raise ValueError("Code can use letters, numbers, - and _ only")
        return v


async def coupon_out(db, c: Coupon) -> dict:
    used = await db.scalar(select(func.count(CouponRedemption.id)).where(CouponRedemption.coupon_id == c.id, CouponRedemption.status == "applied"))
    out = {k: getattr(c, k) for k in ("id", "code", "description", "discount_type", "discount_value", "min_order_paise",
                                      "max_discount_paise", "usage_limit", "per_user_limit", "new_customers_only", "is_active")}
    out.update(starts_at=c.starts_at.isoformat() if c.starts_at else None, ends_at=c.ends_at.isoformat() if c.ends_at else None,
               used_count=used,
               product_ids=list((await db.execute(select(CouponProduct.product_id).where(CouponProduct.coupon_id == c.id))).scalars()),
               category_ids=list((await db.execute(select(CouponCategory.category_id).where(CouponCategory.coupon_id == c.id))).scalars()))
    return out


@router.get("/admin/coupons")
async def list_coupons(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return [await coupon_out(db, c) for c in (await db.execute(select(Coupon).order_by(Coupon.id.desc()))).scalars().all()]


async def _save_coupon(db, c: Coupon, body: CouponIn):
    if body.discount_type == "percent" and body.discount_value > 100:
        raise HTTPException(status_code=400, detail="Percentage discount can't be more than 100.")
    if body.starts_at and body.ends_at and body.ends_at <= body.starts_at:
        raise HTTPException(status_code=400, detail="Expiry must be after the start date.")
    dup = select(Coupon.id).where(func.upper(Coupon.code) == body.code)
    if c.id:
        dup = dup.where(Coupon.id != c.id)
    if (await db.execute(dup)).first():
        raise HTTPException(status_code=409, detail="A coupon with this code already exists.")
    for k, v in body.model_dump(exclude={"product_ids", "category_ids"}).items():
        setattr(c, k, v)
    db.add(c)
    await db.flush()
    await db.execute(delete(CouponProduct).where(CouponProduct.coupon_id == c.id))
    await db.execute(delete(CouponCategory).where(CouponCategory.coupon_id == c.id))
    valid_p = set((await db.execute(select(Product.id).where(Product.id.in_(body.product_ids or [0])))).scalars())
    valid_c = set((await db.execute(select(Category.id).where(Category.id.in_(body.category_ids or [0])))).scalars())
    for pid in valid_p:
        db.add(CouponProduct(coupon_id=c.id, product_id=pid))
    for cid in valid_c:
        db.add(CouponCategory(coupon_id=c.id, category_id=cid))


@router.post("/admin/coupons")
async def create_coupon(body: CouponIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    c = Coupon()
    await _save_coupon(db, c, body)
    audit(db, admin, "coupon_created", "coupon", body.code, body.model_dump(mode="json"), client_ip(request))
    await db.commit()
    return await coupon_out(db, c)


@router.put("/admin/coupons/{cid}")
async def update_coupon(cid: int, body: CouponIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    c = await db.get(Coupon, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Coupon not found")
    await _save_coupon(db, c, body)
    audit(db, admin, "coupon_updated", "coupon", body.code, body.model_dump(mode="json"), client_ip(request))
    await db.commit()
    return await coupon_out(db, c)


@router.get("/admin/coupons/{cid}/redemptions")
async def coupon_redemptions(cid: int, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(CouponRedemption, Order.order_number, Order.status, User.name, User.email)
        .join(Order, Order.id == CouponRedemption.order_id).join(User, User.id == CouponRedemption.user_id)
        .where(CouponRedemption.coupon_id == cid).order_by(CouponRedemption.created_at.desc()).limit(300))).all()
    return [{"order_number": n, "order_status": s, "customer": name, "email": email, "discount_paise": r.discount_paise,
             "status": r.status, "created_at": r.created_at.isoformat()} for r, n, s, name, email in rows]
