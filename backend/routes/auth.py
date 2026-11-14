import asyncio
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import COOKIE_SECURE, ENABLE_TEST_OTP, GOOGLE_CLIENT_ID, OTP_RESEND_COOLDOWN_SECONDS, OTP_TTL_SECONDS, SESSION_COOKIE
from core.db import get_db
from core.models import PasswordResetToken, Role, Session, User
from core.notify import send_password_reset
from core.otp import PURPOSE_SIGNUP_EMAIL, issue_otp, verify_otp
from core.security import (
    client_ip, create_session, hash_password, normalize_phone, rate_limit, record_hit, require_user, sha256,
    user_out, verify_password, get_optional_user, _token_from,
)
from core.store import get_settings
from core.email_templates import signup_otp_email
from core.emailer import send_email, EmailError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
# Legacy Emergent-hosted Google sign-in (kept working until GOOGLE_CLIENT_ID is configured).
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class SendOtpIn(BaseModel):
    email: EmailStr
    name: Optional[str] = ""


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str
    password: str = Field(min_length=8, max_length=128)
    referral_code: Optional[str] = Field(None, max_length=30)
    otp: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return normalize_phone(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return v.strip()


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    phone: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return normalize_phone(v) if v else v


class GoogleIn(BaseModel):
    session_id: str = Field(min_length=5, max_length=500)


class GoogleCredentialIn(BaseModel):
    credential: str = Field(min_length=20, max_length=4000)


async def _role(db, name) -> Role:
    return (await db.execute(select(Role).where(Role.name == name))).scalar_one()


@router.get("/config")
async def auth_config():
    """Public, non-secret auth configuration for the frontend."""
    return {
        "google_client_id": GOOGLE_CLIENT_ID or None,
        "google_mode": "gis" if GOOGLE_CLIENT_ID else "emergent",
        "otp_ttl_seconds": OTP_TTL_SECONDS,
        "otp_resend_cooldown_seconds": OTP_RESEND_COOLDOWN_SECONDS,
        "test_otp_enabled": ENABLE_TEST_OTP,
    }


@router.post("/send-signup-otp")
async def send_signup_otp(body: SendOtpIn, request: Request, db: AsyncSession = Depends(get_db)):
    email = body.email.lower().strip()
    rate_limit(f"signup-otp-ip:{client_ip(request)}", 15, 3600)
    rate_limit(f"signup-otp-email:{email}", 6, 3600)

    # 1. Check if email already registered
    existing = (await db.execute(select(User.id).where(User.email == email))).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.")

    # 2. Issue a hashed, DB-backed OTP (5 min expiry, 5 attempts, single-use, 30 s resend cooldown)
    otp = await issue_otp(db, email, PURPOSE_SIGNUP_EMAIL, ip=client_ip(request))
    await db.commit()

    # 3. Send email with ICEPOPS branding
    s = await get_settings(db)
    subject, html = signup_otp_email(body.name or "", otp, s)
    try:
        await send_email(to=email, subject=subject, html=html)
        logger.info("Signup OTP email sent to %s", email)
    except EmailError as e:
        logger.warning("Could not send signup OTP email to %s: %s", email, e)

    # The code is never returned to the client.
    return {"ok": True, "message": f"Verification code sent to {email}",
            "expires_in_seconds": OTP_TTL_SECONDS, "resend_after_seconds": OTP_RESEND_COOLDOWN_SECONDS}


@router.post("/register")
async def register(body: RegisterIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    rate_limit(f"register:{client_ip(request)}", 15, 3600)
    email = body.email.lower().strip()

    # Verify the emailed OTP. No bypasses: every sign-up needs the real code.
    await verify_otp(db, email, PURPOSE_SIGNUP_EMAIL, body.otp)

    if (await db.execute(select(User.id).where(User.email == email))).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.")
    if (await db.execute(select(User.id).where(User.phone == body.phone))).first():
        raise HTTPException(status_code=409, detail="This mobile number is already registered.")

    referred_by_id = None
    if body.referral_code and body.referral_code.strip():
        ref_code = body.referral_code.strip().upper()
        referrer = (await db.execute(select(User).where(func.upper(User.referral_code) == ref_code))).scalar_one_or_none()
        if not referrer:
            all_users = (await db.execute(select(User))).scalars().all()
            for u in all_users:
                gen_name = re.sub(r"[^A-Za-z]", "", (u.name or "ICE").split()[0]).upper()[:6]
                if f"{gen_name}10" == ref_code or f"{gen_name}20" == ref_code:
                    referrer = u
                    break
        if referrer:
            referred_by_id = referrer.id

    name_clean = re.sub(r"[^A-Za-z]", "", (body.name or "ICE").split()[0]).upper()[:6]
    if not name_clean:
        name_clean = "ICE"
    my_ref_code = f"{name_clean}10"
    if (await db.execute(select(User.id).where(User.referral_code == my_ref_code))).scalar_one_or_none():
        my_ref_code = f"{name_clean}{secrets.token_hex(2).upper()}"

    user = User(
        name=body.name, email=email, phone=body.phone, password_hash=hash_password(body.password),
        referral_code=my_ref_code, referred_by_id=referred_by_id,
        roles=[await _role(db, "customer")]
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An account with these details already exists.")
    token = await create_session(db, user, response)
    await db.commit()
    return user_out(user, token=token)


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    ip_key, email_key = f"login-fail-ip:{client_ip(request)}", f"login-fail:{email}"
    rate_limit(ip_key, 20, 900, record=False)
    rate_limit(email_key, 5, 900, record=False)
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        record_hit(ip_key)
        record_hit(email_key)
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    token = await create_session(db, user, response)
    await db.commit()
    return user_out(user, token=token)


@router.post("/google/session")
async def google_session(body: GoogleIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    rate_limit(f"google:{client_ip(request)}", 20, 900)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google sign-in failed.")
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        user = User(name=(data.get("name") or email.split("@")[0])[:80], email=email, picture=data.get("picture"),
                    roles=[await _role(db, "customer")])
        db.add(user)
        await db.flush()
    elif not user.is_active:
        raise HTTPException(status_code=403, detail="This account is disabled.")
    else:
        user.picture = data.get("picture") or user.picture
    token = await create_session(db, user, response)
    await db.commit()
    return user_out(user, token=token)


@router.post("/google/credential")
async def google_credential(body: GoogleCredentialIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Direct Google Identity Services sign-in: the browser sends the Google ID token ("credential")."""
    rate_limit(f"google:{client_ip(request)}", 20, 900)
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured yet.")
    try:
        info = await asyncio.to_thread(google_id_token.verify_oauth2_token, body.credential, google_requests.Request(), GOOGLE_CLIENT_ID)
    except ValueError as e:
        logger.warning("Google credential rejected: %s", e)
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(status_code=401, detail="Google sign-in failed.")
    email = (info.get("email") or "").lower()
    if not email or not info.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google account email is not verified.")
    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user:
        user = User(name=(info.get("name") or email.split("@")[0])[:80], email=email, picture=info.get("picture"),
                    roles=[await _role(db, "customer")])
        db.add(user)
        await db.flush()
    elif not user.is_active:
        raise HTTPException(status_code=403, detail="This account is disabled.")
    else:
        user.picture = info.get("picture") or user.picture
    token = await create_session(db, user, response)
    await db.commit()
    return user_out(user, token=token)


@router.get("/me")
async def me(user: User = Depends(require_user)):
    return user_out(user)


@router.patch("/me")
async def update_me(body: ProfileIn, user: User = Depends(require_user), db: AsyncSession = Depends(get_db)):
    if body.name:
        user.name = body.name.strip()
    if body.phone and body.phone != user.phone:
        if (await db.execute(select(User.id).where(User.phone == body.phone, User.id != user.id))).first():
            raise HTTPException(status_code=409, detail="This mobile number is already registered.")
        user.phone = body.phone
    db.add(user)
    await db.commit()
    return user_out(user)


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    try:
        token = _token_from(request)
        if token:
            await db.execute(delete(Session).where(Session.token_hash == sha256(token)))
            await db.commit()
    except Exception as e:
        logger.warning(f"Session deletion error on logout: {e}")
    response.delete_cookie(SESSION_COOKIE, path="/", secure=COOKIE_SECURE, httponly=True, samesite="lax")
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(body: ForgotIn, request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    rate_limit(f"forgot-ip:{client_ip(request)}", 5, 900)
    rate_limit(f"forgot:{body.email.lower()}", 3, 3600)
    user = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if user and user.is_active:
        token = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(user_id=user.id, token_hash=sha256(token),
                                  expires_at=datetime.now(timezone.utc) + timedelta(minutes=60)))
        await db.commit()
        background.add_task(send_password_reset, user, token)
    return {"ok": True, "message": "If an account exists for this email, a reset link is on its way."}


@router.post("/reset-password")
async def reset_password(body: ResetIn, request: Request, db: AsyncSession = Depends(get_db)):
    rate_limit(f"reset:{client_ip(request)}", 10, 900)
    rec = (await db.execute(select(PasswordResetToken).where(
        PasswordResetToken.token_hash == sha256(body.token)).with_for_update())).scalar_one_or_none()
    exp = rec.expires_at.replace(tzinfo=timezone.utc) if (rec and rec.expires_at and rec.expires_at.tzinfo is None) else (rec.expires_at if rec else None)
    if not rec or rec.used_at or (exp and exp < datetime.now(timezone.utc)):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired.")
    user = await db.get(User, rec.user_id)
    user.password_hash = hash_password(body.password)
    rec.used_at = datetime.now(timezone.utc)
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    return {"ok": True}
