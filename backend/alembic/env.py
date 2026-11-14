import asyncio
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.config import DATABASE_URL  # noqa: E402  (loads backend/.env)
from core.db import Base, _async_url, _connect_args  # noqa: E402
from core import models  # noqa: E402,F401  (registers every table on Base.metadata)

config = context.config
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout (alembic upgrade head --sql) - handy for reviewing before production."""
    context.configure(url=_async_url(DATABASE_URL), target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True,
                      render_as_batch=connection.dialect.name == "sqlite")
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    engine = create_async_engine(_async_url(DATABASE_URL), poolclass=pool.NullPool,
                                 connect_args=_connect_args(DATABASE_URL))
    async with engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await engine.dispose()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection", None)
    if connection is not None:
        # Called from the running FastAPI app (core/migrate.py) with an existing sync-adapted connection.
        do_run_migrations(connection)
    else:
        # Called from the CLI: `alembic upgrade head`
        asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
