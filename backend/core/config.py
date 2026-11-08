import os
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

IST = ZoneInfo("Asia/Kolkata")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/icepops")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "manojkumarbondada13@gmail.com").strip().lower()
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@12345")
APP_PUBLIC_URL = os.environ.get("APP_PUBLIC_URL", "http://localhost:3000").rstrip("/")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000").split(",") if o.strip()]
SESSION_COOKIE = "icepops_session"
SESSION_DAYS = 7
CSRF_HEADER = "x-csrf-guard"

# Razorpay Configuration
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_Txd5kzeL6T6dBG")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "PP5x3Sd3x7Oah89TDhhWsDYu")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
