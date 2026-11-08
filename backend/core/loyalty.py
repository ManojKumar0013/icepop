from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models import LoyaltyStamp, Promotion, PromotionRedemption


async def loyalty_promo(db: AsyncSession) -> Promotion | None:
    return (await db.execute(select(Promotion).where(Promotion.code == "loyalty"))).scalar_one_or_none()


async def loyalty_status(db: AsyncSession, user_id: int, promo: Promotion) -> dict:
    need = int((promo.config or {}).get("stamps_needed", 10))
    stamps = await db.scalar(select(func.count(LoyaltyStamp.id)).where(
        LoyaltyStamp.user_id == user_id, LoyaltyStamp.status == "active")) or 0
    used = await db.scalar(select(func.count(PromotionRedemption.id)).where(
        PromotionRedemption.promotion_id == promo.id, PromotionRedemption.user_id == user_id,
        PromotionRedemption.status == "applied")) or 0
    earned = stamps // need
    progress = stamps - earned * need
    return {"stamps_needed": need, "stamps_total": stamps, "progress": progress,
            "available_rewards": max(0, earned - used), "to_next": need - progress}


def reward_eligible(promo: Promotion, line: dict) -> bool:
    cfg = promo.config or {}
    ids = set(cfg.get("product_ids") or [])
    if ids:
        return line["product_id"] in ids
    return line["category_slug"] in set(cfg.get("category_slugs") or ["water-popsicles"])


async def loyalty_text(db: AsyncSession, user_id: int, lang: str = "en") -> str:
    promo = await loyalty_promo(db)
    if not promo or not promo.is_enabled:
        return ""
    st = await loyalty_status(db, user_id, promo)
    if lang == "te":
        if st["available_rewards"]:
            return "మీ స్టాంప్ కార్డ్ నిండింది — తర్వాతి వాటర్ పాప్సికిల్ ఉచితం!"
        return f"స్టాంప్ కార్డ్: {st['progress']}/{st['stamps_needed']} — ఉచిత పాప్సికిల్‌కు ఇంకా {st['to_next']} ఆర్డర్లు."
    if st["available_rewards"]:
        return "Your stamp card is full — your next water popsicle is free!"
    return f"Stamp card: {st['progress']} of {st['stamps_needed']} — {st['to_next']} more to a free popsicle."
