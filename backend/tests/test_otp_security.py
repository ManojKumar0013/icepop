# Prompt 1 + 2 regression tests: secure signup OTP (DB-backed, hashed, no bypasses) and hardening.
# Run serially: pytest /app/backend/tests/test_otp_security.py -n 0 -v
# Requires ENABLE_TEST_OTP=true in backend/.env (the OTP is read from the server console log, never the API).
import os
import re
import time
import uuid
import subprocess
import sqlite3
import tempfile

import pytest
import requests
from dotenv import dotenv_values

FE_ENV = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FE_ENV.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
H = {"X-CSRF-Guard": "1", "Content-Type": "application/json"}
LOGS = ["/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"]
RUN = uuid.uuid4().hex[:6]


def otp_from_log(target: str) -> str:
    """Dev-mode only: ENABLE_TEST_OTP=true prints '[TEST OTP] purpose=... target=... code=NNNNNN'."""
    pat = re.compile(r"\[TEST OTP\] purpose=\S+ target=" + re.escape(target) + r" code=(\d{6})")
    for _ in range(10):
        for path in LOGS:
            try:
                found = pat.findall(open(path, encoding="utf-8", errors="ignore").read())
            except FileNotFoundError:
                continue
            if found:
                return found[-1]
        time.sleep(0.5)
    pytest.skip("OTP not found in server log - ENABLE_TEST_OTP=true is required for this test")


def send_otp(email, name="OTP Tester"):
    return requests.post(f"{API}/auth/send-signup-otp", json={"email": email, "name": name}, headers=H, timeout=20)


def register(email, otp, phone=None, headers=None):
    phone = phone or "9" + str(int(time.time() * 1000))[-9:]
    return requests.post(f"{API}/auth/register", json={
        "name": "OTP Tester", "email": email, "phone": phone, "password": "Str0ngPass!", "otp": otp,
    }, headers={**H, **(headers or {})}, timeout=20)


class TestSignupOtpSecurity:
    def test_send_otp_never_returns_code(self):
        r = send_otp(f"otp-{RUN}-a@example.com")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "debug_otp" not in body
        assert not any(re.fullmatch(r"\d{6}", str(v)) for v in body.values()), body
        assert body["expires_in_seconds"] == 300 and body["resend_after_seconds"] == 30

    def test_resend_cooldown_30s(self):
        email = f"otp-{RUN}-b@example.com"
        assert send_otp(email).status_code == 200
        r = send_otp(email)
        assert r.status_code == 429, r.text
        assert "wait" in r.json()["detail"].lower()

    def test_universal_000000_rejected(self):
        email = f"otp-{RUN}-c@example.com"
        assert send_otp(email).status_code == 200
        r = register(email, "000000")
        assert r.status_code == 400, r.text
        assert "invalid" in r.json()["detail"].lower()

    def test_bypass_header_rejected(self):
        email = f"otp-{RUN}-d@test.com"
        r = register(email, None, headers={"x-bypass-otp": "test", "User-Agent": "python-httpx/0.28"})
        assert r.status_code == 400, r.text
        assert "request a verification code" in r.json()["detail"].lower()

    def test_register_without_requesting_code_fails(self):
        r = register(f"otp-{RUN}-e@example.com", "123456")
        assert r.status_code == 400

    def test_wrong_attempts_locked_after_5(self):
        email = f"otp-{RUN}-f@example.com"
        assert send_otp(email).status_code == 200
        real = otp_from_log(email)
        wrong = "000001" if real != "000001" else "000002"
        details = []
        for _ in range(5):
            r = register(email, wrong)
            assert r.status_code == 400
            details.append(r.json()["detail"])
        assert "attempt(s) left" in details[0] and "too many" in details[-1].lower()
        # Even the real code is now refused: a new code must be requested.
        r = register(email, real)
        assert r.status_code == 400 and "request" in r.json()["detail"].lower()

    def test_real_otp_registers_and_is_single_use(self):
        email = f"otp-{RUN}-g@example.com"
        assert send_otp(email).status_code == 200
        real = otp_from_log(email)
        r = register(email, real)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email and "customer" in data["roles"]
        # Same code again (second account attempt) must fail: single-use + email now registered.
        r2 = register(email, real)
        assert r2.status_code in (400, 409)

    def test_password_login_still_works(self):
        email = f"otp-{RUN}-h@example.com"
        assert send_otp(email).status_code == 200
        r = register(email, otp_from_log(email))
        assert r.status_code == 200, r.text
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Str0ngPass!"}, headers=H, timeout=20)
        assert r.status_code == 200 and r.json()["email"] == email


class TestHardening:
    def test_auth_config_public_and_non_secret(self):
        r = requests.get(f"{API}/auth/config", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["google_mode"] in ("gis", "emergent")
        assert set(body) >= {"google_client_id", "otp_ttl_seconds", "otp_resend_cooldown_seconds"}
        assert "secret" not in str(body).lower()

    def test_google_credential_rejects_garbage(self):
        r = requests.post(f"{API}/auth/google/credential", json={"credential": "x" * 40}, headers=H, timeout=20)
        assert r.status_code in (401, 503)

    def test_no_hardcoded_razorpay_secrets_in_code(self):
        out = subprocess.run(["grep", "-rn", "-e", "rzp_test_", "-e", "PP5x3Sd3", "--include=*.py", "/app/backend/core", "/app/backend/routes", "/app/backend/server.py"],
                             capture_output=True, text=True)
        assert out.stdout.strip() == "", out.stdout

    def test_server_has_no_handwritten_alter_table(self):
        src = open("/app/backend/server.py").read()
        assert "ALTER TABLE" not in src and "create_all" not in src

    def test_db_files_are_gitignored(self):
        assert "*.db" in open("/app/.gitignore").read().splitlines()


class TestAlembicMigrations:
    def test_upgrade_fresh_db_then_idempotent_rerun(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "fresh.db")
            env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{db}"}
            for _ in range(2):  # second run must be a no-op
                p = subprocess.run(["python", "-m", "alembic", "upgrade", "head"], cwd="/app/backend", env=env, capture_output=True, text=True)
                assert p.returncode == 0, p.stderr
            c = sqlite3.connect(db)
            tables = {r[0] for r in c.execute("select name from sqlite_master where type='table'")}
            assert {"users", "orders", "otp_codes", "alembic_version"} <= tables
            assert c.execute("select version_num from alembic_version").fetchone()[0] == "0002_otp_codes"
            cols = {r[1] for r in c.execute("pragma table_info(users)")}
            assert "referred_by_id" in cols
            otp_cols = {r[1] for r in c.execute("pragma table_info(otp_codes)")}
            assert {"target", "purpose", "code_hash", "expires_at", "attempts", "used_at"} <= otp_cols

    def test_migrations_are_additive_only(self):
        import glob
        for path in glob.glob("/app/backend/alembic/versions/*.py"):
            src = open(path).read()
            upgrade_src = src.split("def upgrade")[1].split("def downgrade")[0]
            for forbidden in ("drop_table", "drop_column", "TRUNCATE", "DROP TABLE", "DROP COLUMN", "rename_table", "DELETE FROM"):
                assert forbidden not in upgrade_src, f"{path}: {forbidden} in upgrade()"
