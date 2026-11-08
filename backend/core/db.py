from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import DATABASE_URL


def _async_url(raw: str) -> str:
    if "sqlite" in raw:
        return raw
    u = urlsplit(raw)
    query = "prepared_statement_cache_size=0"
    return urlunsplit(("postgresql+asyncpg", u.netloc, u.path, query, ""))


def _connect_args(raw: str) -> dict:
    if "sqlite" in raw:
        return {}
    is_local = "localhost" in raw or "127.0.0.1" in raw
    args = {"statement_cache_size": 0}
    if not is_local and ("sslmode=require" in raw or "neon.tech" in raw or "aws" in raw):
        args["ssl"] = "require"
    return args


def _engine_kwargs(raw: str) -> dict:
    kwargs = {"connect_args": _connect_args(raw)}
    if "sqlite" not in raw:
        kwargs.update({
            "pool_pre_ping": True,
            "pool_size": 5,
            "max_overflow": 5,
            "pool_recycle": 300,
        })
    return kwargs


engine = create_async_engine(
    _async_url(DATABASE_URL),
    **_engine_kwargs(DATABASE_URL),
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session
