import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import COOKIE_SECURE, SESSION_COOKIE
from core.db import get_db
from core.models import PasswordResetToken, Role, Session, User
from core.notify import send_password_reset
from core.security import (
    client_ip, create_session, hash_password, normalize_phone, rate_limit, record_hit, require_user, sha256,
    user_out, verify_password, get_optional_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str
    password: str = Field(min_length=8, max_length=128)

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


async def _role(db, name) -> Role:
    return (await db.execute(select(Role).where(Role.name == name))).scalar_one()


@router.post("/register")
async def register(body: RegisterIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    rate_limit(f"register:{client_ip(request)}", 10, 3600)
    email = body.email.lower()
    if (await db.execute(select(User.id).where(User.email == email))).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.")
    if (await db.execute(select(User.id).where(User.phone == body.phone))).first():
        raise HTTPException(status_code=409, detail="This mobile number is already registered.")
    user = User(name=body.name, email=email, phone=body.phone, password_hash=hash_password(body.password),
                roles=[await _role(db, "customer")])
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
    token = _token_from(request)
    if token:
        await db.execute(delete(Session).where(Session.token_hash == sha256(token)))
        await db.commit()
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
