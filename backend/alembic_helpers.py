"""Idempotent, additive-only schema helpers shared by all migrations (imported by alembic/versions/*.py)."""
import sqlalchemy as sa
from alembic import op


def has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    return column in {c["name"] for c in insp.get_columns(table)}


def has_index(table: str, index: str) -> bool:
    insp = sa.inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    return index in {i["name"] for i in insp.get_indexes(table)}


def add_column_if_missing(table: str, column: sa.Column) -> None:
    """Add a NEW column only when absent. Column must be nullable or carry a server_default."""
    if column.nullable is False and column.server_default is None:
        raise ValueError(f"{table}.{column.name}: NOT NULL columns need a server_default to be additive-safe")
    if not has_column(table, column.name):
        op.add_column(table, column)


def create_index_if_missing(name: str, table: str, columns: list[str], unique: bool = False) -> None:
    if has_table(table) and not has_index(table, name):
        op.create_index(name, table, columns, unique=unique)
