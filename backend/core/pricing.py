from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import DEV_ALLOW_CLOSED_ORDERS, IST
from core.models import (
    Category, Coupon, CouponCategory, CouponProduct, CouponRedemption, Inventory, Order, Product,
    ProductVariant, Promotion, PromotionRedemption, DeliveryZone, User,
)
from core.loyalty import loyalty_status, reward_eligible
from core.store import get_settings, paise

NON_SUCCESS = ("cancelled", "refund_pending", "refunded")
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


async def is_new_customer(db: AsyncSession, user: User) -> bool:
    count = await db.scalar(select(func.count(Order.id)).where(Order.user_id == user.id, Order.status.not_in(NON_SUCCESS)))
    return count == 0


def first_order_key(user_id: int) -> str:
    return f"first_order:{user_id}"


async def _coupon_discount(db, code, user, lines, lock) -> tuple[Optional[dict], Optional[str]]:
    stmt = select(Coupon).where(func.upper(Coupon.code) == code.strip().upper())
    if lock:
        stmt = stmt.with_for_update()
    c = (await db.execute(stmt)).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not c or not c.is_active:
        return None, "This coupon code is not valid."
    c_starts = c.starts_at.replace(tzinfo=timezone.utc) if (c.starts_at and c.starts_at.tzinfo is None) else c.starts_at
    c_ends = c.ends_at.replace(tzinfo=timezone.utc) if (c.ends_at and c.ends_at.tzinfo is None) else c.ends_at
    if c_starts and now < c_starts:
        return None, "This coupon is not active yet."
    if c_ends and now > c_ends:
        return None, "This coupon has expired."
    if not user:
        return None, "Log in to use coupons."
    if c.usage_limit is not None:
        used = await db.scalar(select(func.count(CouponRedemption.id)).where(
            CouponRedemption.coupon_id == c.id, CouponRedemption.status == "applied"))
        if used >= c.usage_limit:
            return None, "This coupon has reached its usage limit."
    mine = await db.scalar(select(func.count(CouponRedemption.id)).where(
        CouponRedemption.coupon_id == c.id, CouponRedemption.user_id == user.id, CouponRedemption.status == "applied"))
    if mine >= c.per_user_limit:
        return None, "You have already used this coupon."
    if c.new_customers_only and not await is_new_customer(db, user):
        return None, "This coupon is only for new customers."
    prod_ids = set((await db.execute(select(CouponProduct.product_id).where(CouponProduct.coupon_id == c.id))).scalars())
    cat_ids = set((await db.execute(select(CouponCategory.category_id).where(CouponCategory.coupon_id == c.id))).scalars())
    restricted = bool(prod_ids or cat_ids)
    eligible = sum(l["line_total_paise"] for l in lines
                   if not restricted or l["product_id"] in prod_ids or l["category_id"] in cat_ids)
    if eligible == 0:
        return None, "This coupon doesn't apply to the items in your cart."
    if eligible < c.min_order_paise:
        return None, f"Add {paise(c.min_order_paise - eligible)} more of eligible items to use this coupon."
    amount = eligible * c.discount_value // 100 if c.discount_type == "percent" else c.discount_value * 100
    if c.max_discount_paise is not None:
        amount = min(amount, c.max_discount_paise)
    amount = min(amount, eligible)
    return {"kind": "coupon", "code": c.code, "coupon_id": c.id, "label": f"Coupon {c.code}",
            "amount": amount, "alloc": []}, None


async def build_quote(db: AsyncSession, user: Optional[User], items: list, coupon_code: Optional[str],
                      fulfilment_type: str, pincode: Optional[str], lock: bool = False,
                      use_reward: bool = False) -> dict:
    errors, notes = [], []
    settings = await get_settings(db)
    promos = {p.code: p for p in (await db.execute(select(Promotion))).scalars()}

    qty: dict[int, int] = {}
    for it in items:
        qty[it.variant_id] = qty.get(it.variant_id, 0) + it.quantity
    if not qty:
        errors.append("Your cart is empty.")

    rows = []
    if qty:
        stmt = (select(ProductVariant, Product, Category, Inventory)
                .join(Product, Product.id == ProductVariant.product_id)
                .join(Category, Category.id == Product.category_id)
                .join(Inventory, Inventory.variant_id == ProductVariant.id)
                .where(ProductVariant.id.in_(list(qty))).order_by(ProductVariant.id))
        if lock:
            stmt = stmt.with_for_update(of=Inventory)
        rows = (await db.execute(stmt)).all()
    found = {v.id for v, *_ in rows}
    missing_ids = set(qty) - found
    if missing_ids:
        errors.append("Some items in your cart are no longer available. Please remove them.")

    lines = []
    for v, p, c, inv in rows:
        q = qty[v.id]
        available = v.is_active and p.is_active and c.is_active
        in_stock = (not inv.track_stock) or inv.quantity >= q
        if not available:
            errors.append(f"{p.name} ({v.name}) is currently unavailable.")
        elif not in_stock:
            errors.append(f"Only {inv.quantity} left of {p.name} ({v.name})." if inv.quantity else f"{p.name} ({v.name}) is out of stock.")
        lines.append({
            "variant_id": v.id, "product_id": p.id, "category_id": c.id, "product_name": p.name,
            "product_slug": p.slug, "variant_name": v.name, "image_url": p.image_url,
            "unit_price_paise": v.price_paise, "quantity": q, "line_total_paise": v.price_paise * q,
            "popsicle_eligible": c.is_popsicle and p.promo_eligible, "available": available and in_stock,
            "category_slug": c.slug, "promo_eligible": p.promo_eligible,
            "free_quantity": 0, "discount_paise": 0,
        })
    for vid in sorted(missing_ids):
        lines.append({
            "variant_id": vid, "product_id": 0, "category_id": 0, "product_name": "Discontinued Item",
            "product_slug": "", "variant_name": f"Variant #{vid}", "image_url": "/images/placeholder.jpg",
            "unit_price_paise": 0, "quantity": qty[vid], "line_total_paise": 0,
            "popsicle_eligible": False, "available": False,
            "category_slug": "", "promo_eligible": False,
            "free_quantity": 0, "discount_paise": 0,
        })
    subtotal = sum(l["line_total_paise"] for l in lines)
    units = sorted([(l["unit_price_paise"], l["variant_id"]) for l in lines if l["popsicle_eligible"]
                    for _ in range(l["quantity"])])

    candidates = []
    now_ist = datetime.now(timezone.utc).astimezone(IST)
    wed = promos.get("wednesday_bogo")
    if wed and wed.is_enabled:
        cfg = wed.config or {}
        buy, free = int(cfg.get("buy", 2)), int(cfg.get("free", 1))
        if now_ist.weekday() in cfg.get("weekdays", [2]):
            free_n = len(units) // (buy + free) * free
            if free_n:
                alloc = units[:free_n]
                candidates.append({"kind": "promotion", "code": wed.code, "promotion_id": wed.id, "label": wed.name,
                                   "amount": sum(u[0] for u in alloc), "alloc": alloc})
            elif units:
                need = buy + free - len(units) % (buy + free)
                notes.append(f"{wed.name}: add {need} more eligible popsicle{'s' if need > 1 else ''} to get {free} free.")

    fam = promos.get("family_pack")
    if fam and fam.is_enabled:
        cfg = fam.config or {}
        size, pack_price = int(cfg.get("pack_size", 5)), int(cfg.get("pack_price_paise", 9000))
        slugs = set(cfg.get("category_slugs", ["water-popsicles"]))
        fam_units = sorted([(l["unit_price_paise"], l["variant_id"]) for l in lines
                            if l["category_slug"] in slugs and l["promo_eligible"] for _ in range(l["quantity"])], reverse=True)
        line_disc, total, consumed = {}, 0, Counter()
        for k in range(len(fam_units) // size):
            group = fam_units[k * size:(k + 1) * size]
            gsum = sum(u[0] for u in group)
            saving = max(0, gsum - pack_price)
            shares = [saving * u[0] // gsum for u in group[:-1]]
            shares.append(saving - sum(shares))
            for (_, vid), d in zip(group, shares):
                line_disc[vid] = line_disc.get(vid, 0) + d
                consumed[vid] += 1
            total += saving
        if total:
            candidates.append({"kind": "promotion", "code": fam.code, "promotion_id": fam.id, "label": fam.name,
                               "amount": total, "alloc": [], "line_discounts": line_disc, "exclusive": True,
                               "consumed": consumed})
        elif fam_units and len(fam_units) < size:
            need = size - len(fam_units)
            notes.append(f"{fam.name}: add {need} more water popsicle{'s' if need > 1 else ''} to get {size} for {paise(pack_price)}.")

    first = promos.get("first_order")
    if first and first.is_enabled and units:
        min_order = int((first.config or {}).get("min_order_paise", 5000))
        if not user:
            notes.append(f"{first.name}: log in to unlock a free popsicle on your first order above {paise(min_order)}.")
        else:
            redeemed = await db.scalar(select(func.count(PromotionRedemption.id)).where(
                PromotionRedemption.once_key == first_order_key(user.id)))
            if not redeemed and await is_new_customer(db, user):
                if subtotal > min_order:
                    candidates.append({"kind": "promotion", "code": first.code, "promotion_id": first.id,
                                       "label": first.name, "amount": units[0][0], "alloc": [units[0]]})
                else:
                    notes.append(f"{first.name}: your first order must be above {paise(min_order)} — add {paise(min_order - subtotal + 100)} more.")

    coupon_error = None
    if coupon_code and coupon_code.strip():
        cand, coupon_error = await _coupon_discount(db, coupon_code, user, lines, lock)
        if cand:
            candidates.append(cand)

    applied = []
    if settings.allow_offer_stacking:
        taken = 0
        for cand in [c for c in candidates if not c.get("exclusive")]:
            if cand["code"] == "first_order":
                remaining = units[taken:]
                if not remaining:
                    continue
                cand["alloc"], cand["amount"] = [remaining[0]], remaining[0][0]
            taken += len(cand["alloc"])
            applied.append(cand)
        exclusive = [c for c in candidates if c.get("exclusive")]
        if exclusive and exclusive[0]["amount"] > sum(c["amount"] for c in applied if c["kind"] != "coupon"):
            applied = exclusive[:1] + [c for c in applied if c["kind"] == "coupon"]
    elif candidates:
        best = max(candidates, key=lambda c: c["amount"])
        applied = [best]
        others = [c["label"] for c in candidates if c is not best]
        if others:
            notes.append(f"Only one offer can be used per order — we applied the best one ({best['label']}). Not combined: {', '.join(others)}.")

    loyalty = {"enabled": False, "applied": False}
    lp = promos.get("loyalty")
    if lp and lp.is_enabled and user:
        loyalty = {"enabled": True, "applied": False, **await loyalty_status(db, user.id, lp)}
        if use_reward and loyalty["available_rewards"] > 0:
            if any(c["kind"] == "coupon" for c in applied):
                notes.append("Your free popsicle can't be combined with a coupon. Remove the coupon to use it.")
            else:
                used = Counter()
                for c in applied:
                    used.update(vid for _, vid in c["alloc"])
                    used.update(c.get("consumed", {}))
                cap = int((lp.config or {}).get("max_value_paise", 2000))
                pool = sorted([(l["unit_price_paise"], l["variant_id"]) for l in lines
                               if reward_eligible(lp, l) and l["quantity"] - used[l["variant_id"]] > 0],
                              key=lambda u: (u[0] > cap, -u[0]))
                if pool:
                    amount = min(pool[0][0], cap)
                    applied.append({"kind": "loyalty", "code": "loyalty", "promotion_id": lp.id,
                                    "label": "Stamp card free popsicle", "amount": amount, "alloc": [(amount, pool[0][1])]})
                    loyalty["applied"] = True
                else:
                    notes.append("Add a water popsicle to your cart to use your free popsicle.")

    discount = min(sum(c["amount"] for c in applied), subtotal)

    delivery_fee, delivery_waived, zone_name, free_remaining = 0, 0, None, None
    items_after_discount = subtotal - discount
    if fulfilment_type == "delivery":
        if not settings.delivery_enabled:
            errors.append("Delivery is currently unavailable. Please choose pickup.")
        fee = settings.default_delivery_fee_paise
        if pincode:
            zone = (await db.execute(select(DeliveryZone).where(DeliveryZone.pincode == pincode.strip(),
                                                               DeliveryZone.is_active.is_(True)))).scalar_one_or_none()
            if not zone:
                if DEV_ALLOW_CLOSED_ORDERS:
                    zone_name = "Delivery Area"
                    fee = settings.default_delivery_fee_paise
                else:
                    errors.append(f"Sorry, we don't deliver to PIN code {pincode} yet. Try pickup instead.")
            else:
                zone_name = zone.name
                if zone.delivery_fee_paise is not None:
                    fee = zone.delivery_fee_paise
        else:
            notes.append("Enter your PIN code at checkout to confirm delivery.")
        if subtotal and subtotal < settings.min_delivery_order_paise:
            errors.append(f"Minimum order for delivery is {paise(settings.min_delivery_order_paise)}.")
        fd = promos.get("free_delivery")
        threshold = int((fd.config or {}).get("threshold_paise", 10000)) if fd else None
        if fd and fd.is_enabled and items_after_discount >= threshold:
            delivery_waived, delivery_fee = fee, 0
        else:
            delivery_fee = fee
            if fd and fd.is_enabled and subtotal:
                free_remaining = threshold - items_after_discount
                notes.append(f"Add {paise(free_remaining)} more for FREE delivery.")
    elif not settings.pickup_enabled:
        errors.append("Pickup is currently unavailable. Please choose delivery.")

    if (fulfilment_type == "delivery" and fd and fd.is_enabled and delivery_fee and subtotal >= threshold
            and applied and all(c["kind"] == "promotion" for c in applied) and discount < delivery_fee):
        skipped = ", ".join(c["label"] for c in applied)
        notes = [n for n in notes if "FREE delivery" not in n]
        notes.append(f"We skipped {skipped} so you get FREE delivery instead — you pay {paise(delivery_fee - discount)} less this way.")
        applied, discount, items_after_discount = [], 0, subtotal
        delivery_waived, delivery_fee, free_remaining = delivery_fee, 0, None

    by_line = {l["variant_id"]: l for l in lines}
    for cand in applied:
        for price, vid in cand["alloc"]:
            if vid in by_line:
                by_line[vid]["free_quantity"] += 1
                by_line[vid]["discount_paise"] += price
        for vid, d in cand.get("line_discounts", {}).items():
            if vid in by_line:
                by_line[vid]["discount_paise"] += d

    return {
        "lines": lines,
        "subtotal_paise": subtotal,
        "discounts": [{"code": c["code"], "label": c["label"], "amount_paise": c["amount"], "kind": c["kind"]} for c in applied],
        "discount_paise": discount,
        "delivery_fee_paise": delivery_fee,
        "delivery_savings_paise": delivery_waived,
        "free_delivery_remaining_paise": free_remaining,
        "delivery_zone": zone_name,
        "total_paise": items_after_discount + delivery_fee,
        "coupon_code": next((c["code"] for c in applied if c["kind"] == "coupon"), None),
        "coupon_error": coupon_error,
        "notes": notes,
        "errors": errors,
        "fulfilment_type": fulfilment_type,
        "is_wednesday_offer_day": bool(wed and now_ist.weekday() in (wed.config or {}).get("weekdays", [2])),
        "loyalty": loyalty,
        "_applied": applied,
    }


def public_quote(q: dict) -> dict:
    return {k: v for k, v in q.items() if not k.startswith("_")}
