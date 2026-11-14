"""Add otp_codes table (database-backed, hashed one-time passwords).

Revision ID: 0002_otp_codes
Revises: 0001_baseline
Create Date: 2026-11-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from alembic_helpers import create_index_if_missing, has_table

revision: str = "0002_otp_codes"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not has_table("otp_codes"):
        op.create_table(
            "otp_codes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("target", sa.String(length=255), nullable=False),
            sa.Column("purpose", sa.String(length=30), nullable=False),
            sa.Column("code_hash", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("superseded", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("ip", sa.String(length=64), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    create_index_if_missing("ix_otp_codes_target_purpose", "otp_codes", ["target", "purpose"])
    create_index_if_missing("ix_otp_codes_created_at", "otp_codes", ["created_at"])


def downgrade() -> None:
    # Only for local/dev databases; never run `alembic downgrade` against production.
    if has_table("otp_codes"):
        op.drop_table("otp_codes")
