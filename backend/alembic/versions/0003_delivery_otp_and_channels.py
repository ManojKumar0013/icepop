"""Delivery-OTP protection columns on orders + notification channel switches on business_settings.

Revision ID: 0003_delivery_otp_channels
Revises: 0002_otp_codes
Create Date: 2026-11-13

Additive only: every column is nullable or has a server default, guarded by has_column.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic_helpers import add_column_if_missing

revision: str = "0003_delivery_otp_channels"
down_revision: Union[str, None] = "0002_otp_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    add_column_if_missing("orders", sa.Column("otp_attempts", sa.Integer(), nullable=False, server_default="0"))
    add_column_if_missing("orders", sa.Column("otp_resends", sa.Integer(), nullable=False, server_default="0"))
    add_column_if_missing("orders", sa.Column("otp_locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    add_column_if_missing("orders", sa.Column("otp_override_reason", sa.String(length=300), nullable=True))
    add_column_if_missing("business_settings", sa.Column("notify_email_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    add_column_if_missing("business_settings", sa.Column("notify_sms_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    add_column_if_missing("business_settings", sa.Column("notify_whatsapp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    # Dev only - never run against production.
    pass
