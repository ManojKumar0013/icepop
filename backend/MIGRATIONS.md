# ICEPOPS database migrations (Alembic)

Production runs on Neon PostgreSQL with **live customers and orders**. Every migration in
`alembic/versions/` is therefore **additive and idempotent**: new tables, nullable columns or
columns with defaults, guarded by `has_table` / `has_column` checks (`alembic_helpers.py`).
Nothing is ever dropped, truncated, renamed or rewritten. `alembic downgrade` must never be run
against production.

The backend applies `alembic upgrade head` automatically on every start (`core/migrate.py`), so a
redeploy is enough to roll out schema changes. The hand-written `ALTER TABLE` loop that used to live
in `server.py` moved into the baseline revision (`0001_baseline`).

## Revisions

| Revision | What it does |
|---|---|
| `0001_baseline` | Snapshot of the pre-Alembic schema (37 tables). Creates only *missing* tables (`checkfirst`) and adds historically-added columns with `ADD COLUMN IF NOT EXISTS` (`users.referred_by_id`, `users.referral_code`, `users.wallet_balance_paise`, `users.language`, `orders.delivery_otp`, `orders.rider_name`, `orders.rider_phone`, `orders.is_pos`, `business_settings.rush_mode/rush_message`, `products.name_te/description_te`). |
| `0002_otp_codes` | New table `otp_codes` (hashed one-time passwords for signup / phone login). |

## 1. Rehearse on a copy first (always)

Create a Neon branch from production (Neon console -> Branches -> *Create branch* from `main`), copy its
connection string, then from `backend/`:

```bash
# use the BRANCH connection string, never production, for the rehearsal
export DATABASE_URL='postgresql+asyncpg://USER:PASSWORD@ep-xxxx-branch.neon.tech/neondb?sslmode=require'

python -m alembic current          # expected: empty (no alembic_version table yet)
python -m alembic upgrade head     # applies 0001_baseline (no-op on existing tables) + 0002_otp_codes
python -m alembic current          # expected: 0002_otp_codes (head)
python -m alembic upgrade head     # second run must print nothing new (idempotent)
```

Verify in the Neon SQL editor that row counts are unchanged, e.g.
`select count(*) from users; select count(*) from orders; select * from alembic_version;`
and that `otp_codes` exists. Delete the branch afterwards.

(A local copy works too: `pg_dump` production -> `psql` into a local database -> same commands.)

## 2. Apply to production

Option A - automatic (recommended): deploy the new code. On the first start the backend runs
`alembic upgrade head`, which on the live database only creates `alembic_version` and `otp_codes`
(every other statement is `IF NOT EXISTS` / `checkfirst`).

Option B - manual, from `backend/` with the **production** `DATABASE_URL` exported:

```bash
python -m alembic stamp 0001_baseline   # mark the existing schema as the baseline (no SQL touches your tables)
python -m alembic upgrade head          # creates otp_codes only
python -m alembic current               # 0002_otp_codes (head)
```

Both options end in the same state. Take a Neon snapshot/branch right before either one.

## 3. Adding a migration later

```bash
cd backend
python -m alembic revision -m "add_x"       # creates alembic/versions/<rev>_add_x.py from the template
```

Use the helpers so the migration stays safe:

```python
from alembic_helpers import add_column_if_missing, create_index_if_missing, has_table

def upgrade():
    add_column_if_missing("users", sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True))
    if not has_table("rider_locations"):
        op.create_table("rider_locations", ...)
```

Rules: NOT NULL columns need a `server_default`; never `drop_*`, `TRUNCATE`, `rename_*` or
`DELETE` in `upgrade()` (the test `tests/test_otp_security.py::TestAlembicMigrations` enforces this).

## Local development

`DATABASE_URL=sqlite+aiosqlite:///./icepops.db` works; the same migrations run on SQLite.
`backend/icepops.db` is git-ignored (`*.db`). If it is still tracked in your clone run
`git rm --cached backend/icepops.db` once and commit.
