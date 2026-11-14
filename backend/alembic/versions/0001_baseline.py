"""Baseline: the schema that production (Neon PostgreSQL) already has.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-11-13

This revision is a *snapshot marker*. On a live database it must be stamped
(`alembic stamp 0001_baseline`) or simply upgraded: everything here is idempotent -
`create_all(checkfirst=True)` only creates tables that do not exist yet and the
ADD COLUMN statements use IF NOT EXISTS. Nothing is ever dropped, renamed, truncated
or rewritten. The ADD COLUMN list replaces the hand-written ALTER TABLE loop that used
to live in server.py (users.referred_by_id, orders.delivery_otp, rider fields, ...).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every table that existed in production before Alembic was introduced.
BASELINE_TABLES = [
    "roles", "users", "user_roles", "sessions", "password_reset_tokens", "addresses",
    "categories", "products", "product_variants", "inventory", "inventory_movements",
    "delivery_zones", "business_settings", "opening_hours", "holidays", "policy_pages",
    "carts", "cart_items", "orders", "order_items", "order_status_history", "payments",
    "coupons", "coupon_products", "coupon_categories", "coupon_redemptions",
    "promotions", "promotion_redemptions", "loyalty_stamps", "reviews",
    "notifications", "notification_outbox", "uploaded_files", "audit_logs",
    "catering_inquiries", "subscriptions", "gift_cards",
]

# Columns added over time to already-existing tables (all nullable or defaulted -> additive-safe).
POSTGRES_ADD_COLUMNS = (
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS name_te VARCHAR(120)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS description_te TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en'",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance_paise INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_id INTEGER",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(6)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_name VARCHAR(80)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_phone VARCHAR(15)",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_pos BOOLEAN DEFAULT FALSE",
    # Widening a VARCHAR is non-destructive (no data is changed).
    "ALTER TABLE orders ALTER COLUMN fulfilment_type TYPE VARCHAR(20)",
    "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS rush_mode BOOLEAN DEFAULT FALSE",
    "ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS rush_message VARCHAR(300)",
)


def upgrade() -> None:
    from core.db import Base
    from core import models  # noqa: F401

    bind = op.get_bind()
    tables = [Base.metadata.tables[n] for n in BASELINE_TABLES if n in Base.metadata.tables]
    # checkfirst=True -> only missing tables are created; existing tables are left untouched.
    Base.metadata.create_all(bind=bind, tables=tables, checkfirst=True)
    if bind.dialect.name == "postgresql":
        for stmt in POSTGRES_ADD_COLUMNS:
            op.execute(stmt)


def downgrade() -> None:
    # The baseline is never reverted: downgrading would drop live data.
    pass
