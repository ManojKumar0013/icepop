from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import IST
from core.models import BusinessSettings, Holiday, OpeningHour

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


async def get_settings(db: AsyncSession) -> BusinessSettings:
    return (await db.execute(select(BusinessSettings).where(BusinessSettings.id == 1))).scalar_one()


def paise(v: int) -> str:
    rupees = v / 100
    return f"₹{rupees:,.0f}" if v % 100 == 0 else f"₹{rupees:,.2f}"


async def store_status(db: AsyncSession, at: datetime | None = None) -> dict:
    s = await get_settings(db)
    at_ist = (at or datetime.now(timezone.utc)).astimezone(IST)
    if s.is_temporarily_closed:
        return {"open": False, "reason": s.closure_message or "We are temporarily closed."}
    if getattr(s, "rush_mode", False):
        return {"open": False, "reason": getattr(s, "rush_message", None) or "High parlour rush right now — orders temporarily paused. Please check back shortly."}
    holiday = (await db.execute(select(Holiday).where(Holiday.date == at_ist.date()))).scalar_one_or_none()
    if holiday:
        return {"open": False, "reason": f"Closed today: {holiday.reason}"}
    hours = (await db.execute(select(OpeningHour).where(OpeningHour.weekday == at_ist.weekday()))).scalar_one_or_none()
    if not hours or hours.is_closed:
        return {"open": False, "reason": f"Closed on {WEEKDAYS[at_ist.weekday()]}s."}
    t = at_ist.time()
    if not (hours.open_time <= t < hours.close_time):
        return {"open": False, "reason": f"Open today {hours.open_time:%I:%M %p} – {hours.close_time:%I:%M %p}."}
    return {"open": True, "reason": None}


async def validate_order_time(db: AsyncSession, preferred: datetime | None) -> str | None:
    now = datetime.now(timezone.utc)
    if preferred is None:
        st = await store_status(db, now)
        return None if st["open"] else f"We're not taking orders right now. {st['reason']} You can choose a preferred time instead."
    if preferred.tzinfo is None:
        preferred = preferred.replace(tzinfo=IST)
    if preferred < now + timedelta(minutes=15):
        return "Preferred time must be at least 15 minutes from now."
    if preferred > now + timedelta(days=3):
        return "Preferred time can be at most 3 days ahead."
    st = await store_status(db, preferred)
    return None if st["open"] else f"We're closed at the chosen time. {st['reason']}"
