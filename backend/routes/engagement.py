from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.loyalty import loyalty_promo, loyalty_status
from core.models import Notification, Order, OrderItem, Product, Review, User
from core.notify import admin_ids
from core.security import audit, client_ip, rate_limit, require_admin, require_user

router = APIRouter(tags=["engagement"])


def _first_name(name: str) -> str:
    return (name or "Customer").strip().split()[0][:20].title()


def review_public(r: Review, product: Optional[str] = None) -> dict:
    return {"id": r.id, "name": r.display_name, "rating": r.rating, "comment": r.comment, "reply": r.reply,
            "product": product, "created_at": r.created_at.isoformat()}


@router.get("/loyalty/me")
async def my_loyalty(user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    promo = await loyalty_promo(db)
    if not promo or not promo.is_enabled:
        return {"enabled": False}
    return {"enabled": True, "name": promo.name, "description": promo.description, **await loyalty_status(db, user.id, promo)}


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=300)


@router.post("/orders/{number}/review")
async def create_review(number: str, body: ReviewIn, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    rate_limit(f"review:{user.id}", 10, 3600)
    o = (await db.execute(select(Order).where(Order.order_number == number))).scalar_one_or_none()
    if not o or o.user_id != user.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if o.status != "delivered":
        raise HTTPException(status_code=400, detail="You can rate an order once it has been delivered.")
    if (await db.execute(select(Review.id).where(Review.order_id == o.id))).first():
        raise HTTPException(status_code=400, detail="You've already rated this order. Thank you!")
    r = Review(order_id=o.id, user_id=user.id, rating=body.rating, comment=(body.comment or "").strip() or None,
               display_name=_first_name(o.customer_name), status="pending")
    db.add(r)
    for uid in await admin_ids(db):
        db.add(Notification(user_id=uid, title="New review to approve", order_number=o.order_number,
                            body=f"{r.display_name} rated order {o.order_number} {body.rating}/5"))
    await db.commit()
    return {"rating": r.rating, "comment": r.comment, "status": r.status, "reply": r.reply}


async def _approved(db, product_id: Optional[int] = None, limit: int = 20, min_rating: int = 1):
    stmt = (select(Review).where(Review.status == "approved", Review.rating >= min_rating)
            .order_by(Review.created_at.desc()).limit(limit))
    if product_id:
        stmt = stmt.where(Review.order_id.in_(select(OrderItem.order_id).where(OrderItem.product_id == product_id)))
    return (await db.execute(stmt)).scalars().all()


@router.get("/catalog/products/{slug}/reviews")
async def product_reviews(slug: str, db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Product).where(Product.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    scope = Review.order_id.in_(select(OrderItem.order_id).where(OrderItem.product_id == p.id))
    avg, count = (await db.execute(select(func.avg(Review.rating), func.count(Review.id))
                                   .where(Review.status == "approved", scope))).one()
    return {"average": round(float(avg), 1) if avg else None, "count": count,
            "reviews": [review_public(r) for r in await _approved(db, p.id, 10)]}


@router.get("/reviews/featured")
async def featured_reviews(db: AsyncSession = Depends(get_db)):
    rows = await _approved(db, limit=6, min_rating=4)
    names = {}
    if rows:
        for oid, pname in (await db.execute(select(OrderItem.order_id, OrderItem.product_name)
                                            .where(OrderItem.order_id.in_([r.order_id for r in rows]))
                                            .order_by(OrderItem.id))).all():
            names.setdefault(oid, pname)
    return [review_public(r, names.get(r.order_id)) for r in rows]


@router.get("/admin/reviews")
async def admin_reviews(status: Optional[str] = None, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    stmt = select(Review, Order.order_number, Order.customer_name).join(Order, Order.id == Review.order_id) \
        .order_by(Review.created_at.desc()).limit(200)
    if status:
        stmt = stmt.where(Review.status == status)
    rows = (await db.execute(stmt)).all()
    items = {}
    if rows:
        for oid, pname in (await db.execute(select(OrderItem.order_id, OrderItem.product_name)
                                            .where(OrderItem.order_id.in_([r.order_id for r, *_ in rows])))).all():
            items.setdefault(oid, []).append(pname)
    return [{**review_public(r), "status": r.status, "order_number": num, "customer_name": cname,
             "products": items.get(r.order_id, [])} for r, num, cname in rows]


class ReviewModIn(BaseModel):
    status: Optional[Literal["approved", "hidden"]] = None
    reply: Optional[str] = Field(None, max_length=300)


@router.patch("/admin/reviews/{review_id}")
async def moderate_review(review_id: int, body: ReviewModIn, request: Request, admin: User = Depends(require_admin),
                          db: AsyncSession = Depends(get_db)):
    r = await db.get(Review, review_id)
    if not r:
        raise HTTPException(status_code=404, detail="Review not found")
    if body.status:
        r.status = body.status
    if body.reply is not None:
        r.reply = body.reply.strip() or None
    audit(db, admin, "review_moderated", "review", review_id, {"status": r.status, "reply": bool(r.reply)}, client_ip(request))
    await db.commit()
    return {**review_public(r), "status": r.status}
