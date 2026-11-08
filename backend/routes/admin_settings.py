import re
from datetime import date, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.db import get_db
from core.models import DeliveryZone, Holiday, OpeningHour, PolicyPage, User
from core.security import audit, client_ip, require_admin, validate_pincode
from core.store import WEEKDAYS, get_settings, store_status

router = APIRouter(prefix="/admin", tags=["admin-settings"])
SETTINGS_FIELDS = ("business_name", "tagline", "logo_url", "phone", "whatsapp", "email", "address_line", "city", "state",
                   "pincode", "map_embed_url", "fssai_number", "gstin", "is_temporarily_closed", "closure_message",
                   "rush_mode", "rush_message",
                   "pickup_enabled", "delivery_enabled", "default_delivery_fee_paise", "min_delivery_order_paise")


class PaymentMethodIn(BaseModel):
    code: str
    enabled: bool


class Testimonial(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    text: str = Field(min_length=3, max_length=400)


class SettingsIn(BaseModel):
    business_name: str = Field(min_length=2, max_length=100)
    tagline: Optional[str] = Field(None, max_length=200)
    logo_url: Optional[str] = Field(None, max_length=500)
    phone: str = Field(min_length=3, max_length=40)
    whatsapp: Optional[str] = Field(None, max_length=40)
    email: str = Field(min_length=3, max_length=255)
    address_line: str = Field(min_length=2, max_length=300)
    city: str = Field(min_length=1, max_length=80)
    state: str = Field(min_length=1, max_length=80)
    pincode: str = Field(min_length=1, max_length=20)
    map_embed_url: Optional[str] = Field(None, max_length=1000)
    fssai_number: str = Field(min_length=1, max_length=40)
    gstin: Optional[str] = Field(None, max_length=40)
    is_temporarily_closed: bool = False
    closure_message: Optional[str] = Field(None, max_length=300)
    rush_mode: bool = False
    rush_message: Optional[str] = Field(None, max_length=300)
    pickup_enabled: bool = True
    delivery_enabled: bool = True
    default_delivery_fee_paise: int = Field(ge=0, le=1_000_000)
    min_delivery_order_paise: int = Field(ge=0, le=10_000_000)
    payment_methods: list[PaymentMethodIn] = Field(default_factory=list, max_length=5)
    testimonials: list[Testimonial] = Field(default_factory=list, max_length=12)

    @field_validator("map_embed_url")
    @classmethod
    def _map(cls, v):
        if v and not re.match(r"^https://(www\.)?google\.com/maps/embed\?", v):
            raise ValueError("Map link must be a Google Maps embed link (https://www.google.com/maps/embed?...)")
        return v or None

    @field_validator("logo_url")
    @classmethod
    def _logo(cls, v):
        if v and not re.match(r"^(/api/files/[\w./-]+|/images/[\w.-]+)$", v):
            raise ValueError("Logo must be an uploaded image")
        return v or None


class HourIn(BaseModel):
    weekday: int = Field(ge=0, le=6)
    open: time
    close: time
    is_closed: bool = False


class HolidayIn(BaseModel):
    date: date
    reason: str = Field(min_length=2, max_length=200)


class ZoneIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    pincode: str
    delivery_fee_paise: Optional[int] = Field(None, ge=0, le=1_000_000)
    is_active: bool = True

    @field_validator("pincode")
    @classmethod
    def _pin(cls, v):
        return validate_pincode(v)


class PolicyIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=10, max_length=20000)


async def settings_payload(db) -> dict:
    s = await get_settings(db)
    out = {k: getattr(s, k) for k in SETTINGS_FIELDS}
    out["payment_methods"] = s.payment_methods
    out["testimonials"] = s.testimonials or []
    out["hours"] = [{"weekday": h.weekday, "day": WEEKDAYS[h.weekday], "open": h.open_time.strftime("%H:%M"),
                     "close": h.close_time.strftime("%H:%M"), "is_closed": h.is_closed}
                    for h in (await db.execute(select(OpeningHour).order_by(OpeningHour.weekday))).scalars()]
    out["holidays"] = [{"id": h.id, "date": h.date.isoformat(), "reason": h.reason}
                       for h in (await db.execute(select(Holiday).order_by(Holiday.date))).scalars()]
    out["zones"] = [{"id": z.id, "name": z.name, "pincode": z.pincode, "delivery_fee_paise": z.delivery_fee_paise, "is_active": z.is_active}
                    for z in (await db.execute(select(DeliveryZone).order_by(DeliveryZone.pincode))).scalars()]
    out["policies"] = [{"slug": p.slug, "title": p.title, "content": p.content}
                       for p in (await db.execute(select(PolicyPage).order_by(PolicyPage.id))).scalars()]
    out["status"] = await store_status(db)
    return out


@router.get("/settings")
async def get_all(admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await settings_payload(db)


@router.put("/settings")
async def save_settings(body: SettingsIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    s = await get_settings(db)
    for k in SETTINGS_FIELDS:
        setattr(s, k, getattr(body, k))
    if not body.is_temporarily_closed:
        s.closure_message = None
    if not body.rush_mode:
        s.rush_message = None
    wanted = {m.code: m.enabled for m in body.payment_methods}
    s.payment_methods = [{**m, "enabled": bool(wanted.get(m["code"], m["enabled"]))} for m in s.payment_methods]
    s.testimonials = [t.model_dump() for t in body.testimonials]
    audit(db, admin, "settings_updated", "settings", 1, body.model_dump(mode="json"), client_ip(request))
    await db.commit()
    return await settings_payload(db)


@router.put("/hours")
async def save_hours(body: list[HourIn], request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if sorted(h.weekday for h in body) != list(range(7)):
        raise HTTPException(status_code=400, detail="Provide hours for all 7 days.")
    for h in body:
        if not h.is_closed and h.close <= h.open:
            raise HTTPException(status_code=400, detail=f"{WEEKDAYS[h.weekday]}: closing time must be after opening time.")
        row = (await db.execute(select(OpeningHour).where(OpeningHour.weekday == h.weekday))).scalar_one()
        row.open_time, row.close_time, row.is_closed = h.open, h.close, h.is_closed
    audit(db, admin, "hours_updated", "settings", 1, {"hours": [h.model_dump(mode="json") for h in body]}, client_ip(request))
    await db.commit()
    return await settings_payload(db)


@router.post("/holidays")
async def add_holiday(body: HolidayIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(Holiday.id).where(Holiday.date == body.date))).first():
        raise HTTPException(status_code=409, detail="That date is already marked as a holiday.")
    db.add(Holiday(date=body.date, reason=body.reason))
    audit(db, admin, "holiday_added", "holiday", body.date.isoformat(), {"reason": body.reason}, client_ip(request))
    await db.commit()
    return await settings_payload(db)


@router.delete("/holidays/{hid}")
async def remove_holiday(hid: int, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(Holiday).where(Holiday.id == hid))
    audit(db, admin, "holiday_removed", "holiday", hid, {}, client_ip(request))
    await db.commit()
    return await settings_payload(db)


async def _zone_conflict(db, pincode, exclude=None):
    stmt = select(DeliveryZone.id).where(DeliveryZone.pincode == pincode)
    if exclude:
        stmt = stmt.where(DeliveryZone.id != exclude)
    if (await db.execute(stmt)).first():
        raise HTTPException(status_code=409, detail=f"PIN code {pincode} is already in a delivery zone.")


@router.post("/zones")
async def add_zone(body: ZoneIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await _zone_conflict(db, body.pincode)
    db.add(DeliveryZone(**body.model_dump()))
    audit(db, admin, "zone_added", "delivery_zone", body.pincode, body.model_dump(), client_ip(request))
    await db.commit()
    return await settings_payload(db)


@router.put("/zones/{zid}")
async def update_zone(zid: int, body: ZoneIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    z = await db.get(DeliveryZone, zid)
    if not z:
        raise HTTPException(status_code=404, detail="Zone not found")
    await _zone_conflict(db, body.pincode, zid)
    for k, v in body.model_dump().items():
        setattr(z, k, v)
    audit(db, admin, "zone_updated", "delivery_zone", body.pincode, body.model_dump(), client_ip(request))
    await db.commit()
    return await settings_payload(db)


@router.delete("/zones/{zid}")
async def delete_zone(zid: int, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await db.execute(delete(DeliveryZone).where(DeliveryZone.id == zid))
    audit(db, admin, "zone_removed", "delivery_zone", zid, {}, client_ip(request))
    await db.commit()
    return await settings_payload(db)


@router.put("/policies/{slug}")
async def save_policy(slug: str, body: PolicyIn, request: Request, admin: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(PolicyPage).where(PolicyPage.slug == slug))).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Page not found")
    p.title, p.content = body.title, body.content
    audit(db, admin, "policy_updated", "policy", slug, {"title": body.title}, client_ip(request))
    await db.commit()
    return await settings_payload(db)
