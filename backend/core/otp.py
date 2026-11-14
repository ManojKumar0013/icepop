"""Database-backed one-time passwords.

Rules: 6 digits, hashed at rest (sha256 + optional pepper), 5-minute expiry, max 5 wrong attempts,
single-use, 30-second resend cooldown, one active code per (target, purpose).
The plain code is returned to the caller only so it can be delivered (email / SMS); it is never stored.
"""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import ENABLE_TEST_OTP, OTP_MAX_ATTEMPTS, OTP_PEPPER, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS
from core.models import OtpCode

logger = logging.getLogger(__name__)

PURPOSE_SIGNUP_EMAIL = "signup_email"
PURPOSE_SIGNUP_PHONE = "signup_phone"
PURPOSE_LOGIN_PHONE = "login_phone"
PURPOSE_VERIFY_PHONE = "verify_phone"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def hash_code(target: str, purpose: str, code: str) -> str:
    return hashlib.sha256(f"{OTP_PEPPER}:{purpose}:{target}:{code}".encode()).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


async def _latest_active(db: AsyncSession, target: str, purpose: str) -> Optional[OtpCode]:
    return (await db.execute(
        select(OtpCode).where(OtpCode.target == target, OtpCode.purpose == purpose, OtpCode.used_at.is_(None))
        .order_by(OtpCode.id.desc()).limit(1)
    )).scalar_one_or_none()


async def issue_otp(db: AsyncSession, target: str, purpose: str, ip: Optional[str] = None) -> str:
    """Create a fresh OTP for target/purpose (enforcing the resend cooldown) and return the plain code.

    The caller must commit. Older unused codes for the same target/purpose are marked superseded so
    only the newest code can ever be verified.
    """
    now = _now()
    latest = await _latest_active(db, target, purpose)
    if latest is not None:
        age = (now - _aware(latest.created_at)).total_seconds()
        if age < OTP_RESEND_COOLDOWN_SECONDS:
            wait = max(1, int(OTP_RESEND_COOLDOWN_SECONDS - age))
            raise HTTPException(status_code=429, detail=f"Please wait {wait} seconds before requesting a new code.")
    # Supersede every still-active code for this target/purpose (single active code).
    active = (await db.execute(select(OtpCode).where(
        OtpCode.target == target, OtpCode.purpose == purpose, OtpCode.used_at.is_(None)))).scalars().all()
    for rec in active:
        rec.used_at = now
        rec.superseded = True
    code = generate_code()
    db.add(OtpCode(target=target, purpose=purpose, code_hash=hash_code(target, purpose, code),
                   expires_at=now + timedelta(seconds=OTP_TTL_SECONDS), attempts=0, ip=ip))
    await db.flush()
    if ENABLE_TEST_OTP:
        # Dev/test only (ENABLE_TEST_OTP=true and APP_ENV != production): console only, never the API.
        logger.info("[TEST OTP] purpose=%s target=%s code=%s", purpose, target, code)
    return code


async def verify_otp(db: AsyncSession, target: str, purpose: str, code: Optional[str]) -> None:
    """Validate `code`; raises HTTPException(400) on any failure. Marks the code used on success.

    Wrong attempts are persisted immediately (own commit) so they survive the caller's rollback.
    """
    rec = await _latest_active(db, target, purpose)
    if rec is None:
        raise HTTPException(status_code=400, detail="Please request a verification code first.")
    now = _now()
    if _aware(rec.expires_at) < now:
        rec.used_at = now
        await db.commit()
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new code.")
    if rec.attempts >= OTP_MAX_ATTEMPTS:
        rec.used_at = now
        await db.commit()
        raise HTTPException(status_code=400, detail="Too many invalid attempts. Please request a new code.")
    clean = (code or "").strip()
    if not clean or not secrets.compare_digest(rec.code_hash, hash_code(target, purpose, clean)):
        rec.attempts += 1
        remaining = OTP_MAX_ATTEMPTS - rec.attempts
        if remaining <= 0:
            rec.used_at = now
            await db.commit()
            raise HTTPException(status_code=400, detail="Too many invalid attempts. Please request a new code.")
        await db.commit()
        raise HTTPException(status_code=400, detail=f"Invalid verification code. {remaining} attempt(s) left.")
    rec.used_at = now
    rec.verified = True
    await db.flush()


async def purge_old_codes(db: AsyncSession, older_than_hours: int = 24) -> int:
    """Housekeeping for the otp_codes table (ephemeral rows only)."""
    cutoff = _now() - timedelta(hours=older_than_hours)
    res = await db.execute(delete(OtpCode).where(OtpCode.created_at < cutoff))
    return res.rowcount or 0
