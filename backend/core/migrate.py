"""Run Alembic migrations programmatically at startup (shares the app's async engine).

Every migration in alembic/versions is additive and idempotent (checks before creating), so running
`upgrade head` on a live database is safe: existing tables, columns and rows are never dropped,
truncated, renamed or rewritten.
"""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncEngine

BACKEND_DIR = Path(__file__).resolve().parent.parent
logger = logging.getLogger(__name__)


def alembic_config(connection=None) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


def _upgrade_sync(connection) -> None:
    command.upgrade(alembic_config(connection), "head")


async def run_migrations(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        await conn.run_sync(_upgrade_sync)
    logger.info("Alembic migrations applied (head)")
