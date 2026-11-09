import logging

from sqlalchemy import text

from core.config import CORS_ORIGINS, CSRF_HEADER, DATABASE_URL  # noqa: loads .env first

from fastapi import APIRouter, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware

from core.db import Base, SessionLocal, engine
from core import models  # noqa: F401
from core.seed import seed
from routes import admin, admin_catalog, admin_settings, auth, cart, catalog, engagement, giftcards, orders, payments, pos, rider

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="ICEPOPS API")
api = APIRouter(prefix="/api")


@api.get("/")
async def health():
    return {"status": "ok", "service": "icepops"}


for r in (auth.router, catalog.router, cart.router, orders.router, admin.router, admin_catalog.router, admin_settings.router,
          payments.router, engagement.router, pos.router, rider.router, giftcards.router):
    api.include_router(r)
app.include_router(api)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_EXEMPT = {"/api/payments/razorpay/webhook"}


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    # CSRF: browsers can't add custom headers cross-site without a CORS preflight we don't allow.
    if (request.method in UNSAFE and request.url.path.startswith("/api") and request.url.path not in CSRF_EXEMPT
            and request.headers.get(CSRF_HEADER) != "1"):
        res = JSONResponse({"detail": "Missing security header"}, status_code=403)
        if origin:
            res.headers["Access-Control-Allow-Origin"] = origin
            res.headers["Access-Control-Allow-Credentials"] = "true"
        return res
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api") and not request.url.path.startswith("/api/files/"):
        response.headers["Cache-Control"] = "no-store"
    if origin and "Access-Control-Allow-Origin" not in response.headers:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=list(set(CORS_ORIGINS + ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:8000", "http://127.0.0.1:8000"])),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    res = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    origin = request.headers.get("origin")
    if origin:
        res.headers["Access-Control-Allow-Origin"] = origin
        res.headers["Access-Control-Allow-Credentials"] = "true"
    return res


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        msg = err.get("msg", "")
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        loc = err.get("loc", [])
        field = loc[-1] if loc else ""
        if field and str(field) not in ("body", "__root__"):
            messages.append(f"{field}: {msg}")
        else:
            messages.append(msg)
    clean_detail = ", ".join(messages)
    res = JSONResponse(status_code=400, content={"detail": clean_detail})
    origin = request.headers.get("origin")
    if origin:
        res.headers["Access-Control-Allow-Origin"] = origin
        res.headers["Access-Control-Allow-Credentials"] = "true"
    return res


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if "postgres" in DATABASE_URL:
            for stmt in ("ALTER TABLE products ADD COLUMN IF NOT EXISTS name_te VARCHAR(120)",
                         "ALTER TABLE products ADD COLUMN IF NOT EXISTS description_te TEXT",
                         "ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en'",
                         "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)",
                         "ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance_paise INTEGER DEFAULT 0",
                         "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(6)",
                         "ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_name VARCHAR(80)",
                         "ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_phone VARCHAR(15)",
                         "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_pos BOOLEAN DEFAULT FALSE",
                         "ALTER TABLE orders ALTER COLUMN fulfilment_type TYPE VARCHAR(20)",
                         "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS rush_mode BOOLEAN DEFAULT FALSE",
                         "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS rush_message VARCHAR(300)"):
                await conn.execute(text(stmt))
    async with SessionLocal() as db:
        await seed(db)
    logger.info("ICEPOPS database ready")


@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()


if __name__ == "__main__":
    import os
    import socket
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    try:
        # Create dual-stack socket so both IPv4 (127.0.0.1) and IPv6 (::1/localhost) work on Windows
        sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        sock.bind(("::", port))
        sock.listen()
        print(f"Dual-stack ICEPOPS server listening on port {port} (IPv4 and IPv6)...")
        config = uvicorn.Config(app, log_level="info")
        server = uvicorn.Server(config)
        server.run(sockets=[sock])
    except Exception as e:
        print(f"Dual-stack bind notice ({e}), starting standard uvicorn on port {port}...")
        uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)

