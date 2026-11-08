import hashlib
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import SESSION_COOKIE, SESSION_DAYS
from core.db import get_db
from core.models import AuditLog, Session, User

PHONE_RE = re.compile(r"^[6-9]\d{9}$")
PIN_RE = re.compile(r"^[1-9]\d{5}$")


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not PHONE_RE.match(digits):
        raise ValueError("Enter a valid 10-digit Indian mobile number")
    return digits


def validate_pincode(raw: str) -> str:
    pin = (raw or "").strip()
    if not PIN_RE.match(pin):
        raise ValueError("Enter a valid 6-digit PIN code")
    return pin


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()


def verify_password(password: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(password.encode(), hashed.encode())


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str, limit: int, window_seconds: int, record: bool = True) -> None:
    """Raise 429 once `limit` hits are recorded within the window; record=False only checks."""
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window_seconds:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes and try again.")
    if record:
        q.append(now)


def record_hit(key: str) -> None:
    _hits[key].append(time.monotonic())


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


async def create_session(db: AsyncSession, user: User, response: Response) -> str:
    token = secrets.token_urlsafe(32)
    db.add(Session(user_id=user.id, token_hash=sha256(token),
                   expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)))
    response.set_cookie(SESSION_COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True,
                        secure=True, samesite="lax", path="/")
    return token


def _token_from(request: Request) -> Optional[str]:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        return token
    auth = request.headers.get("authorization", "")
    return auth[7:] if auth.lower().startswith("bearer ") else None


async def get_optional_user(request: Request, db: AsyncSession = Depends(get_db)) -> Optional[User]:
    token = _token_from(request)
    if not token:
        return None
    row = (await db.execute(
        select(Session, User).join(User, User.id == Session.user_id).where(Session.token_hash == sha256(token))
    )).first()
    if not row:
        return None
    session, user = row
    exp = session.expires_at.replace(tzinfo=timezone.utc) if (session.expires_at and session.expires_at.tzinfo is None) else session.expires_at
    if not exp or exp < datetime.now(timezone.utc) or not user.is_active:
        return None
    return user


async def require_user(user: Optional[User] = Depends(get_optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Please log in to continue")
    return user


async def require_admin(user: User = Depends(require_user)) -> User:
    if "admin" not in user.role_names:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def audit(db: AsyncSession, actor: Optional[User], action: str, entity: str, entity_id, details: dict, ip: str = None):
    db.add(AuditLog(actor_user_id=actor.id if actor else None, action=action, entity=entity,
                    entity_id=str(entity_id) if entity_id is not None else None, details=details, ip=ip))


def user_out(user: User) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
            "picture": user.picture, "roles": user.role_names, "has_password": bool(user.password_hash),
            "language": user.language or "en"}
