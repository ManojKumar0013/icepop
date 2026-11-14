#!/usr/bin/env python3
"""
Backend testing for ICEPOPS Phase 1 security fixes.
Tests secure signup OTP, hardening, and regression checks.
"""
import os
import re
import sqlite3
import time
from datetime import datetime

import httpx

# Base URL from frontend/.env
BASE_URL = "https://c293059a-57cc-4f9b-aba8-0c8a27dd2b1f.preview.emergentagent.com/api"
CSRF_HEADER = {"X-CSRF-Guard": "1"}

# Admin credentials from backend/.env
ADMIN_EMAIL = "manojkumarbondada13@gmail.com"
ADMIN_PASSWORD = "Admin@12345"

# Test data prefix
TEST_PREFIX = "TEST_"


def log(msg):
    """Print timestamped log message."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def generate_unique_email():
    """Generate unique test email."""
    timestamp = int(time.time() * 1000)
    return f"{TEST_PREFIX}user_{timestamp}@example.com"


def generate_unique_phone():
    """Generate unique 10-digit phone starting with 6-9."""
    timestamp = str(int(time.time() * 1000))[-9:]
    return f"9{timestamp}"


def read_otp_from_log(email):
    """Read OTP from backend log file."""
    log_file = "/var/log/supervisor/backend.err.log"
    try:
        with open(log_file, "r") as f:
            lines = f.readlines()
        # Search from the end for the most recent OTP
        for line in reversed(lines):
            if f"[TEST OTP] purpose=signup_email target={email}" in line:
                match = re.search(r"code=(\d{6})", line)
                if match:
                    return match.group(1)
    except Exception as e:
        log(f"Error reading OTP from log: {e}")
    return None


def inspect_otp_db():
    """Inspect SQLite DB to verify OTP storage."""
    db_path = "/app/backend/icepops.db"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if otp_codes table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='otp_codes'")
        if not cursor.fetchone():
            return {"error": "otp_codes table not found"}
        
        # Get latest OTP record
        cursor.execute("""
            SELECT id, target, purpose, code_hash, expires_at, attempts, used_at, verified, superseded
            FROM otp_codes ORDER BY id DESC LIMIT 1
        """)
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {
                "id": row[0],
                "target": row[1],
                "purpose": row[2],
                "code_hash": row[3],
                "code_hash_length": len(row[3]) if row[3] else 0,
                "expires_at": row[4],
                "attempts": row[5],
                "used_at": row[6],
                "verified": row[7],
                "superseded": row[8]
            }
        return {"error": "No OTP records found"}
    except Exception as e:
        return {"error": str(e)}


def check_alembic_version():
    """Check Alembic version in DB."""
    db_path = "/app/backend/icepops.db"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if alembic_version table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'")
        if not cursor.fetchone():
            return {"error": "alembic_version table not found"}
        
        cursor.execute("SELECT version_num FROM alembic_version")
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return {"version_num": row[0]}
        return {"error": "No version found"}
    except Exception as e:
        return {"error": str(e)}


class TestResults:
    """Track test results."""
    def __init__(self):
        self.passed = []
        self.failed = []
        self.created_users = []
    
    def add_pass(self, test_name, details=""):
        self.passed.append((test_name, details))
        log(f"✅ PASS: {test_name}")
        if details:
            log(f"   {details}")
    
    def add_fail(self, test_name, details=""):
        self.failed.append((test_name, details))
        log(f"❌ FAIL: {test_name}")
        if details:
            log(f"   {details}")
    
    def track_user(self, email, user_id=None):
        """Track created test user for cleanup."""
        self.created_users.append({"email": email, "id": user_id})
    
    def print_summary(self):
        log("\n" + "="*80)
        log("TEST SUMMARY")
        log("="*80)
        log(f"Total Passed: {len(self.passed)}")
        log(f"Total Failed: {len(self.failed)}")
        
        if self.failed:
            log("\n❌ FAILED TESTS:")
            for test_name, details in self.failed:
                log(f"  - {test_name}")
                if details:
                    log(f"    {details}")
        
        if self.passed:
            log("\n✅ PASSED TESTS:")
            for test_name, details in self.passed:
                log(f"  - {test_name}")


def main():
    results = TestResults()
    
    log("="*80)
    log("ICEPOPS BACKEND TESTING - Phase 1 Security Fixes")
    log("="*80)
    
    # ========================================================================
    # A. SECURE SIGNUP OTP TESTS
    # ========================================================================
    log("\n" + "="*80)
    log("A. SECURE SIGNUP OTP TESTS")
    log("="*80)
    
    # Test A1: Send OTP - verify response doesn't contain debug_otp or 6-digit code
    log("\nTest A1: Send signup OTP - no debug_otp in response")
    email_a1 = generate_unique_email()
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{BASE_URL}/auth/send-signup-otp",
                json={"email": email_a1, "name": "Test User"},
                headers=CSRF_HEADER
            )
            
            if resp.status_code == 200:
                data = resp.json()
                # Check response doesn't contain debug_otp or any 6-digit number
                response_text = str(data)
                has_debug_otp = "debug_otp" in response_text.lower()
                has_six_digits = bool(re.search(r'\b\d{6}\b', response_text))
                has_expires_in = "expires_in_seconds" in data and data["expires_in_seconds"] == 300
                has_resend_after = "resend_after_seconds" in data and data["resend_after_seconds"] == 30
                
                if not has_debug_otp and not has_six_digits and has_expires_in and has_resend_after:
                    results.add_pass("A1: Send OTP response secure", 
                                   f"Response: {data}")
                else:
                    issues = []
                    if has_debug_otp:
                        issues.append("Contains debug_otp")
                    if has_six_digits:
                        issues.append("Contains 6-digit code")
                    if not has_expires_in:
                        issues.append("Missing/wrong expires_in_seconds")
                    if not has_resend_after:
                        issues.append("Missing/wrong resend_after_seconds")
                    results.add_fail("A1: Send OTP response not secure", 
                                   f"Issues: {', '.join(issues)}. Response: {data}")
            else:
                results.add_fail("A1: Send OTP failed", 
                               f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        results.add_fail("A1: Send OTP exception", str(e))
    
    # Test A2: Resend cooldown - immediate repeat should return 429
    log("\nTest A2: Resend cooldown - immediate repeat should return 429")
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{BASE_URL}/auth/send-signup-otp",
                json={"email": email_a1, "name": "Test User"},
                headers=CSRF_HEADER
            )
            
            if resp.status_code == 429:
                data = resp.json()
                detail = data.get("detail", "")
                if "wait" in detail.lower() and "seconds" in detail.lower():
                    results.add_pass("A2: Resend cooldown enforced", 
                                   f"Response: {detail}")
                else:
                    results.add_fail("A2: Resend cooldown message unclear", 
                                   f"Response: {detail}")
            else:
                results.add_fail("A2: Resend cooldown not enforced", 
                               f"Expected 429, got {resp.status_code}. Response: {resp.text}")
    except Exception as e:
        results.add_fail("A2: Resend cooldown exception", str(e))
    
    # Test A3: Register with wrong OTP (000000) should fail
    log("\nTest A3: Register with universal OTP 000000 should fail")
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{BASE_URL}/auth/register",
                json={
                    "name": "Test User A3",
                    "email": email_a1,
                    "phone": generate_unique_phone(),
                    "password": "Str0ngPass!",
                    "otp": "000000"
                },
                headers=CSRF_HEADER
            )
            
            if resp.status_code == 400:
                results.add_pass("A3: Universal OTP 000000 rejected", 
                               f"Response: {resp.json().get('detail', '')}")
            else:
                results.add_fail("A3: Universal OTP 000000 not rejected", 
                               f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        results.add_fail("A3: Universal OTP test exception", str(e))
    
    # Test A4: Bypass header test
    log("\nTest A4: x-bypass-otp header should not work")
    email_a4 = generate_unique_email()
    try:
        with httpx.Client(timeout=30) as client:
            # Try to register with bypass header without requesting OTP first
            resp = client.post(
                f"{BASE_URL}/auth/register",
                json={
                    "name": "Test User A4",
                    "email": email_a4.replace("@example.com", "@test.com"),
                    "phone": generate_unique_phone(),
                    "password": "Str0ngPass!"
                },
                headers={
                    **CSRF_HEADER,
                    "x-bypass-otp": "test",
                    "User-Agent": "python-httpx/0.24.0"
                }
            )
            
            if resp.status_code == 400:
                detail = resp.json().get("detail", "")
                if "request a verification code first" in detail.lower():
                    results.add_pass("A4: Bypass header rejected", 
                                   f"Response: {detail}")
                else:
                    results.add_fail("A4: Bypass header rejected but wrong message", 
                                   f"Response: {detail}")
            else:
                results.add_fail("A4: Bypass header not rejected", 
                               f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        results.add_fail("A4: Bypass header test exception", str(e))
    
    # Test A5: Wrong attempt lockout
    log("\nTest A5: Wrong attempt lockout (5 attempts)")
    email_a5 = generate_unique_email()
    try:
        with httpx.Client(timeout=30) as client:
            # Request OTP
            resp = client.post(
                f"{BASE_URL}/auth/send-signup-otp",
                json={"email": email_a5, "name": "Test User A5"},
                headers=CSRF_HEADER
            )
            
            if resp.status_code != 200:
                results.add_fail("A5: Could not request OTP", 
                               f"Status: {resp.status_code}, Response: {resp.text}")
            else:
                time.sleep(2)  # Wait for log to be written
                
                # Read real OTP first
                real_otp = read_otp_from_log(email_a5)
                if not real_otp:
                    results.add_fail("A5: Could not read real OTP from log", "")
                else:
                    log(f"   Real OTP: {real_otp}")
                    
                    # Try 5 wrong attempts
                    lockout_triggered = False
                    for i in range(1, 6):
                        resp = client.post(
                            f"{BASE_URL}/auth/register",
                            json={
                                "name": "Test User A5",
                                "email": email_a5,
                                "phone": generate_unique_phone(),
                                "password": "Str0ngPass!",
                                "otp": "999999"
                            },
                            headers=CSRF_HEADER
                        )
                        
                        if resp.status_code == 400:
                            detail = resp.json().get("detail", "")
                            if i < 5:
                                if "attempt(s) left" in detail.lower():
                                    log(f"   Attempt {i}: {detail}")
                                else:
                                    log(f"   Attempt {i}: Missing attempt count in message")
                            else:
                                if "too many invalid attempts" in detail.lower():
                                    lockout_triggered = True
                                    log(f"   Attempt {i}: {detail}")
                                else:
                                    log(f"   Attempt {i}: Wrong lockout message: {detail}")
                        time.sleep(0.5)
                    
                    # Now try with real OTP - should still be locked
                    resp = client.post(
                        f"{BASE_URL}/auth/register",
                        json={
                            "name": "Test User A5",
                            "email": email_a5,
                            "phone": generate_unique_phone(),
                            "password": "Str0ngPass!",
                            "otp": real_otp
                        },
                        headers=CSRF_HEADER
                    )
                    
                    if resp.status_code == 400 and lockout_triggered:
                        results.add_pass("A5: Wrong attempt lockout working", 
                                       "5 wrong attempts locked, real OTP also rejected")
                    else:
                        results.add_fail("A5: Lockout not enforced after 5 attempts", 
                                       f"Real OTP status: {resp.status_code}")
    except Exception as e:
        results.add_fail("A5: Wrong attempt lockout exception", str(e))
    
    # Test A6: Happy path - request OTP, read from log, register successfully
    log("\nTest A6: Happy path - request OTP, read from log, register")
    email_a6 = generate_unique_email()
    phone_a6 = generate_unique_phone()
    try:
        with httpx.Client(timeout=30) as client:
            # Request OTP
            resp = client.post(
                f"{BASE_URL}/auth/send-signup-otp",
                json={"email": email_a6, "name": "Test User A6"},
                headers=CSRF_HEADER
            )
            
            if resp.status_code != 200:
                results.add_fail("A6: Could not request OTP", 
                               f"Status: {resp.status_code}, Response: {resp.text}")
            else:
                time.sleep(2)  # Wait for log to be written
                
                # Read OTP from log
                real_otp = read_otp_from_log(email_a6)
                if not real_otp:
                    results.add_fail("A6: Could not read OTP from log", "")
                else:
                    log(f"   Read OTP from log: {real_otp}")
                    
                    # Register with real OTP
                    resp = client.post(
                        f"{BASE_URL}/auth/register",
                        json={
                            "name": "Test User A6",
                            "email": email_a6,
                            "phone": phone_a6,
                            "password": "Str0ngPass!",
                            "otp": real_otp
                        },
                        headers=CSRF_HEADER
                    )
                    
                    if resp.status_code == 200:
                        data = resp.json()
                        user_id = data.get("id")
                        roles = data.get("roles", [])
                        
                        if "customer" in roles:
                            results.add_pass("A6: Happy path registration successful", 
                                           f"User ID: {user_id}, Roles: {roles}")
                            results.track_user(email_a6, user_id)
                            
                            # Try to reuse same OTP - should fail
                            resp = client.post(
                                f"{BASE_URL}/auth/register",
                                json={
                                    "name": "Test User A6 Reuse",
                                    "email": generate_unique_email(),
                                    "phone": generate_unique_phone(),
                                    "password": "Str0ngPass!",
                                    "otp": real_otp
                                },
                                headers=CSRF_HEADER
                            )
                            
                            if resp.status_code in [400, 409]:
                                results.add_pass("A6: OTP single-use enforced", 
                                               "Reusing OTP rejected")
                            else:
                                results.add_fail("A6: OTP reuse not prevented", 
                                               f"Status: {resp.status_code}")
                            
                            # Test login with new account
                            resp = client.post(
                                f"{BASE_URL}/auth/login",
                                json={
                                    "email": email_a6,
                                    "password": "Str0ngPass!"
                                },
                                headers=CSRF_HEADER
                            )
                            
                            if resp.status_code == 200:
                                results.add_pass("A6: Login with new account successful", "")
                            else:
                                results.add_fail("A6: Login with new account failed", 
                                               f"Status: {resp.status_code}, Response: {resp.text}")
                        else:
                            results.add_fail("A6: Registration missing customer role", 
                                           f"Roles: {roles}")
                    else:
                        results.add_fail("A6: Registration with real OTP failed", 
                                       f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        results.add_fail("A6: Happy path exception", str(e))
    
    # Test A7: Check OTP storage in DB
    log("\nTest A7: Check OTP storage in DB (hashed)")
    try:
        db_info = inspect_otp_db()
        if "error" in db_info:
            results.add_fail("A7: DB inspection failed", db_info["error"])
        else:
            # Check that code_hash is 64 hex chars (SHA256)
            code_hash = db_info.get("code_hash", "")
            code_hash_len = db_info.get("code_hash_length", 0)
            
            if code_hash_len == 64 and all(c in "0123456789abcdef" for c in code_hash.lower()):
                results.add_pass("A7: OTP stored as hash", 
                               f"code_hash length: {code_hash_len}, has expires_at, attempts, used_at columns")
            else:
                results.add_fail("A7: OTP not properly hashed", 
                               f"code_hash length: {code_hash_len}, expected 64 hex chars")
    except Exception as e:
        results.add_fail("A7: DB inspection exception", str(e))
    
    # ========================================================================
    # B. HARDENING TESTS
    # ========================================================================
    log("\n" + "="*80)
    log("B. HARDENING TESTS")
    log("="*80)
    
    # Test B8: GET /auth/config
    log("\nTest B8: GET /auth/config")
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.get(f"{BASE_URL}/auth/config")
            
            if resp.status_code == 200:
                data = resp.json()
                required_keys = ["google_client_id", "google_mode", "otp_ttl_seconds", 
                               "otp_resend_cooldown_seconds", "test_otp_enabled"]
                
                missing_keys = [k for k in required_keys if k not in data]
                
                if not missing_keys:
                    google_mode = data.get("google_mode")
                    if google_mode == "emergent":
                        results.add_pass("B8: /auth/config endpoint working", 
                                       f"google_mode: {google_mode}, otp_ttl: {data.get('otp_ttl_seconds')}, "
                                       f"resend_cooldown: {data.get('otp_resend_cooldown_seconds')}")
                    else:
                        results.add_fail("B8: /auth/config wrong google_mode", 
                                       f"Expected 'emergent', got '{google_mode}'")
                else:
                    results.add_fail("B8: /auth/config missing keys", 
                                   f"Missing: {missing_keys}")
            else:
                results.add_fail("B8: /auth/config failed", 
                               f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        results.add_fail("B8: /auth/config exception", str(e))
    
    # Test B9: POST /auth/google/credential without Google configured
    log("\nTest B9: POST /auth/google/credential (Google not configured)")
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{BASE_URL}/auth/google/credential",
                json={"credential": "x" * 40},
                headers=CSRF_HEADER
            )
            
            if resp.status_code == 503:
                detail = resp.json().get("detail", "")
                if "not configured" in detail.lower():
                    results.add_pass("B9: Google credential returns 503 when not configured", 
                                   f"Response: {detail}")
                else:
                    results.add_fail("B9: Google credential 503 but wrong message", 
                                   f"Response: {detail}")
            else:
                results.add_fail("B9: Google credential wrong status", 
                               f"Expected 503, got {resp.status_code}. Response: {resp.text}")
    except Exception as e:
        results.add_fail("B9: Google credential exception", str(e))
    
    # Test B10: Check Alembic migrations in log and DB
    log("\nTest B10: Check Alembic migrations")
    try:
        # Check log for Alembic message
        log_file = "/var/log/supervisor/backend.err.log"
        with open(log_file, "r") as f:
            log_content = f.read()
        
        has_alembic_log = "Alembic migrations applied (head)" in log_content
        
        # Check DB for alembic_version table
        db_version = check_alembic_version()
        
        if has_alembic_log and "version_num" in db_version:
            version = db_version["version_num"]
            if version == "0002_otp_codes":
                results.add_pass("B10: Alembic migrations working", 
                               f"Log message found, DB version: {version}")
            else:
                results.add_fail("B10: Alembic version mismatch", 
                               f"Expected '0002_otp_codes', got '{version}'")
        else:
            issues = []
            if not has_alembic_log:
                issues.append("Log message not found")
            if "error" in db_version:
                issues.append(f"DB error: {db_version['error']}")
            results.add_fail("B10: Alembic migrations check failed", 
                           f"Issues: {', '.join(issues)}")
    except Exception as e:
        results.add_fail("B10: Alembic check exception", str(e))
    
    # Test B11: Run pytest suite (optional)
    log("\nTest B11: Run pytest suite (optional)")
    try:
        import subprocess
        result = subprocess.run(
            ["python", "-m", "pytest", "tests/test_otp_security.py", "-n", "0", "-q"],
            cwd="/app/backend",
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            results.add_pass("B11: pytest suite passed", 
                           f"Output: {result.stdout.strip()}")
        else:
            results.add_fail("B11: pytest suite failed", 
                           f"Return code: {result.returncode}, Output: {result.stdout}, Errors: {result.stderr}")
    except Exception as e:
        log(f"   Skipping pytest suite: {e}")
    
    # ========================================================================
    # C. REGRESSION TESTS
    # ========================================================================
    log("\n" + "="*80)
    log("C. REGRESSION TESTS")
    log("="*80)
    
    # Test C12: Admin login and /auth/me
    log("\nTest C12: Admin email+password login and /auth/me")
    admin_session_cookie = None
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            resp = client.post(
                f"{BASE_URL}/auth/login",
                json={
                    "email": ADMIN_EMAIL,
                    "password": ADMIN_PASSWORD
                },
                headers=CSRF_HEADER
            )
            
            if resp.status_code == 200:
                data = resp.json()
                roles = data.get("roles", [])
                
                if "admin" in roles:
                    results.add_pass("C12: Admin login successful", 
                                   f"Roles: {roles}")
                    
                    # Get session cookie
                    admin_session_cookie = resp.cookies.get("icepops_session")
                    
                    # Test /auth/me
                    resp = client.get(
                        f"{BASE_URL}/auth/me",
                        cookies={"icepops_session": admin_session_cookie} if admin_session_cookie else None
                    )
                    
                    if resp.status_code == 200:
                        me_data = resp.json()
                        if me_data.get("email") == ADMIN_EMAIL:
                            results.add_pass("C12: /auth/me working", 
                                           f"Email: {me_data.get('email')}")
                        else:
                            results.add_fail("C12: /auth/me wrong user", 
                                           f"Expected {ADMIN_EMAIL}, got {me_data.get('email')}")
                    else:
                        results.add_fail("C12: /auth/me failed", 
                                       f"Status: {resp.status_code}, Response: {resp.text}")
                else:
                    results.add_fail("C12: Admin login missing admin role", 
                                   f"Roles: {roles}")
            else:
                results.add_fail("C12: Admin login failed", 
                               f"Status: {resp.status_code}, Response: {resp.text}")
    except Exception as e:
        results.add_fail("C12: Admin login exception", str(e))
    
    # Test C13: Smoke tests for various endpoints
    log("\nTest C13: Smoke tests for catalog, cart, orders, admin, rider")
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            # Catalog endpoints (public)
            endpoints = [
                ("GET /catalog/products", "GET", f"{BASE_URL}/catalog/products", None, None),
                ("GET /catalog/categories", "GET", f"{BASE_URL}/catalog/categories", None, None),
            ]
            
            # Customer endpoints (need customer session from A6)
            if email_a6:
                # Login as customer
                resp = client.post(
                    f"{BASE_URL}/auth/login",
                    json={"email": email_a6, "password": "Str0ngPass!"},
                    headers=CSRF_HEADER
                )
                if resp.status_code == 200:
                    customer_cookie = resp.cookies.get("icepops_session")
                    endpoints.extend([
                        ("GET /cart", "GET", f"{BASE_URL}/cart", customer_cookie, None),
                        ("GET /orders", "GET", f"{BASE_URL}/orders", customer_cookie, None),
                    ])
            
            # Admin endpoints
            if admin_session_cookie:
                endpoints.extend([
                    ("GET /admin/orders", "GET", f"{BASE_URL}/admin/orders", admin_session_cookie, None),
                ])
            
            # Rider endpoints (expect 401/403 for anon, not 500)
            endpoints.extend([
                ("GET /rider/orders", "GET", f"{BASE_URL}/rider/orders", None, None),
            ])
            
            for name, method, url, cookie, body in endpoints:
                try:
                    if method == "GET":
                        resp = client.get(
                            url,
                            cookies={"icepops_session": cookie} if cookie else None
                        )
                    else:
                        resp = client.post(
                            url,
                            json=body,
                            headers=CSRF_HEADER,
                            cookies={"icepops_session": cookie} if cookie else None
                        )
                    
                    # Accept 200, 401, 403 as valid (not 500)
                    if resp.status_code in [200, 401, 403]:
                        results.add_pass(f"C13: {name}", 
                                       f"Status: {resp.status_code}")
                    else:
                        results.add_fail(f"C13: {name} unexpected status", 
                                       f"Status: {resp.status_code}, Response: {resp.text[:200]}")
                except Exception as e:
                    results.add_fail(f"C13: {name} exception", str(e))
    except Exception as e:
        results.add_fail("C13: Smoke tests exception", str(e))
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    results.print_summary()
    
    log("\n" + "="*80)
    log("TEST EXECUTION COMPLETE")
    log("="*80)
    
    # Return exit code based on results
    return 0 if not results.failed else 1


if __name__ == "__main__":
    exit(main())
