import logging
import os
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

logger = logging.getLogger(__name__)


def _flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("true", "1", "yes", "on")


IST = ZoneInfo("Asia/Kolkata")

# APP_ENV=production turns on strict checks (required secrets, no OTP debug logging).
APP_ENV = (os.environ.get("APP_ENV") or "development").strip().lower()
IS_PRODUCTION = APP_ENV in ("production", "prod")

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/icepops")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "manojkumarbondada13@gmail.com").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "http://localhost:3000").rstrip("/")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000").split(",") if o.strip()]
SESSION_COOKIE = "icepops_session"
SESSION_DAYS = 7
CSRF_HEADER = "x-csrf-guard"
COOKIE_SECURE = _flag("COOKIE_SECURE") or APP_PUBLIC_URL.startswith("https://")
DEV_ALLOW_CLOSED_ORDERS = _flag("DEV_ALLOW_CLOSED_ORDERS")

# --- One-time passwords -------------------------------------------------------------------------
# ENABLE_TEST_OTP=true logs every generated OTP to the server console (never to the API response).
# It is ignored entirely when APP_ENV=production.
ENABLE_TEST_OTP = _flag("ENABLE_TEST_OTP") and not IS_PRODUCTION
OTP_TTL_SECONDS = 5 * 60
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 30
# Optional server-side pepper mixed into OTP hashes so a DB dump alone cannot brute-force 6-digit codes.
OTP_PEPPER = os.environ.get("OTP_PEPPER", "")

# --- Razorpay (no defaults: keys must come from the environment) -----------------------------------
RAZORPAY_KEY_ID = (os.environ.get("RAZORPAY_KEY_ID") or "").strip()
RAZORPAY_KEY_SECRET = (os.environ.get("RAZORPAY_KEY_SECRET") or "").strip()
RAZORPAY_WEBHOOK_SECRET = (os.environ.get("RAZORPAY_WEBHOOK_SECRET") or "").strip()

# --- Google Identity Services (direct Google sign-in) ------------------------------------------------
# Only the OAuth client ID is required for the ID-token ("credential") flow used by the frontend button.
GOOGLE_CLIENT_ID = (os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
GOOGLE_CLIENT_SECRET = (os.environ.get("GOOGLE_CLIENT_SECRET") or "").strip()


def validate_production_config() -> None:
    """Fail fast with a clear message when a production deployment is missing required secrets."""
    if not IS_PRODUCTION:
        if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
            logger.warning("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set - online payments run in simulation mode.")
        return
    missing = [name for name, value in (("RAZORPAY_KEY_ID", RAZORPAY_KEY_ID), ("RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET),
                                        ("DATABASE_URL", os.environ.get("DATABASE_URL")), ("ADMIN_EMAIL", os.environ.get("ADMIN_EMAIL")),
                                        ("ADMIN_PASSWORD", os.environ.get("ADMIN_PASSWORD"))) if not value]
    if missing:
        raise RuntimeError(
            "ICEPOPS cannot start in production: missing required environment variable(s): "
            + ", ".join(missing) + ". Set them on your host (see .env.example) and restart."
        )
    if _flag("ENABLE_TEST_OTP"):
        logger.warning("ENABLE_TEST_OTP is set but ignored because APP_ENV=production.")


validate_production_config()
