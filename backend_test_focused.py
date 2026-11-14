#!/usr/bin/env python3
"""
Focused backend testing for ICEPOPS Phase 1 - avoiding rate limits.
"""
import os
import re
import sqlite3
import time
from datetime import datetime

import httpx

BASE_URL = "https://c293059a-57cc-4f9b-aba8-0c8a27dd2b1f.preview.emergentagent.com/api"
CSRF_HEADER = {"X-CSRF-Guard": "1"}
ADMIN_EMAIL = "manojkumarbondada13@gmail.com"
ADMIN_PASSWORD = "Admin@12345"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def generate_unique_email():
    timestamp = int(time.time() * 1000)
    return f"TEST_user_{timestamp}@example.com"

def generate_unique_phone():
    timestamp = str(int(time.time() * 1000))[-9:]
    return f"9{timestamp}"

def read_otp_from_log(email):
    log_file = "/var/log/supervisor/backend.err.log"
    try:
        # Email is lowercased by the backend
        email_lower = email.lower()
        with open(log_file, "r") as f:
            lines = f.readlines()
        for line in reversed(lines):
            if f"[TEST OTP] purpose=signup_email target={email_lower}" in line:
                match = re.search(r"code=(\d{6})", line)
                if match:
                    return match.group(1)
    except Exception as e:
        log(f"Error reading OTP: {e}")
    return None

def check_alembic_version():
    db_path = "/app/backend/icepops.db"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT version_num FROM alembic_version")
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        return None

def inspect_otp_db():
    db_path = "/app/backend/icepops.db"
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT code_hash FROM otp_codes ORDER BY id DESC LIMIT 1
        """)
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None
    except Exception as e:
        return None

log("="*80)
log("ICEPOPS BACKEND TESTING - Phase 1 (Focused)")
log("="*80)

passed = []
failed = []

# Test 1: /auth/config
log("\n1. GET /auth/config")
try:
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{BASE_URL}/auth/config")
        if resp.status_code == 200:
            data = resp.json()
            if data.get("google_mode") == "emergent" and data.get("otp_ttl_seconds") == 300:
                passed.append("GET /auth/config")
                log(f"   ✅ PASS: {data}")
            else:
                failed.append(("GET /auth/config", f"Wrong data: {data}"))
                log(f"   ❌ FAIL: Wrong data")
        else:
            failed.append(("GET /auth/config", f"Status {resp.status_code}"))
            log(f"   ❌ FAIL: Status {resp.status_code}")
except Exception as e:
    failed.append(("GET /auth/config", str(e)))
    log(f"   ❌ FAIL: {e}")

# Test 2: Google credential without config
log("\n2. POST /auth/google/credential (not configured)")
try:
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{BASE_URL}/auth/google/credential",
            json={"credential": "x" * 40},
            headers=CSRF_HEADER
        )
        if resp.status_code == 503:
            passed.append("Google credential 503")
            log(f"   ✅ PASS: {resp.json().get('detail')}")
        else:
            failed.append(("Google credential", f"Expected 503, got {resp.status_code}"))
            log(f"   ❌ FAIL: Expected 503, got {resp.status_code}")
except Exception as e:
    failed.append(("Google credential", str(e)))
    log(f"   ❌ FAIL: {e}")

# Test 3: Alembic migrations
log("\n3. Check Alembic migrations")
version = check_alembic_version()
log_file = "/var/log/supervisor/backend.err.log"
with open(log_file, "r") as f:
    has_log = "Alembic migrations applied (head)" in f.read()

if version == "0002_otp_codes" and has_log:
    passed.append("Alembic migrations")
    log(f"   ✅ PASS: Version {version}, log message found")
else:
    failed.append(("Alembic migrations", f"Version: {version}, Log: {has_log}"))
    log(f"   ❌ FAIL: Version {version}, Log: {has_log}")

# Test 4: Admin login
log("\n4. Admin login and /auth/me")
try:
    with httpx.Client(timeout=30, follow_redirects=True) as client:
        resp = client.post(
            f"{BASE_URL}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            headers=CSRF_HEADER
        )
        if resp.status_code == 200:
            data = resp.json()
            if "admin" in data.get("roles", []):
                passed.append("Admin login")
                log(f"   ✅ PASS: Admin login successful")
                
                # Test /auth/me
                cookie = resp.cookies.get("icepops_session")
                resp = client.get(
                    f"{BASE_URL}/auth/me",
                    cookies={"icepops_session": cookie} if cookie else None
                )
                if resp.status_code == 200 and resp.json().get("email") == ADMIN_EMAIL:
                    passed.append("/auth/me")
                    log(f"   ✅ PASS: /auth/me working")
                else:
                    failed.append(("/auth/me", f"Status {resp.status_code}"))
                    log(f"   ❌ FAIL: /auth/me status {resp.status_code}")
            else:
                failed.append(("Admin login", "Missing admin role"))
                log(f"   ❌ FAIL: Missing admin role")
        else:
            failed.append(("Admin login", f"Status {resp.status_code}"))
            log(f"   ❌ FAIL: Status {resp.status_code}")
except Exception as e:
    failed.append(("Admin login", str(e)))
    log(f"   ❌ FAIL: {e}")

# Test 5: Catalog endpoints
log("\n5. Catalog endpoints")
try:
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{BASE_URL}/catalog/products")
        if resp.status_code == 200:
            passed.append("GET /catalog/products")
            log(f"   ✅ PASS: GET /catalog/products")
        else:
            failed.append(("GET /catalog/products", f"Status {resp.status_code}"))
            log(f"   ❌ FAIL: Status {resp.status_code}")
        
        resp = client.get(f"{BASE_URL}/catalog/categories")
        if resp.status_code == 200:
            passed.append("GET /catalog/categories")
            log(f"   ✅ PASS: GET /catalog/categories")
        else:
            failed.append(("GET /catalog/categories", f"Status {resp.status_code}"))
            log(f"   ❌ FAIL: Status {resp.status_code}")
except Exception as e:
    failed.append(("Catalog", str(e)))
    log(f"   ❌ FAIL: {e}")

# Test 6: OTP flow (single test to avoid rate limits)
log("\n6. OTP flow (send, verify response, check DB)")
email = generate_unique_email()
try:
    with httpx.Client(timeout=30) as client:
        # Send OTP
        resp = client.post(
            f"{BASE_URL}/auth/send-signup-otp",
            json={"email": email, "name": "Test User"},
            headers=CSRF_HEADER
        )
        
        if resp.status_code == 200:
            data = resp.json()
            # Check response doesn't contain debug_otp or 6-digit code
            response_text = str(data)
            has_debug = "debug_otp" in response_text.lower()
            has_code = bool(re.search(r'\b\d{6}\b', response_text))
            has_expires = data.get("expires_in_seconds") == 300
            has_resend = data.get("resend_after_seconds") == 30
            
            if not has_debug and not has_code and has_expires and has_resend:
                passed.append("OTP response secure")
                log(f"   ✅ PASS: OTP response secure (no code in response)")
                
                # Wait and read from log
                time.sleep(3)
                otp = read_otp_from_log(email)
                if otp:
                    passed.append("OTP in log")
                    log(f"   ✅ PASS: OTP found in log: {otp}")
                    
                    # Check DB storage
                    code_hash = inspect_otp_db()
                    if code_hash and len(code_hash) == 64:
                        passed.append("OTP hashed in DB")
                        log(f"   ✅ PASS: OTP stored as hash (64 chars)")
                    else:
                        failed.append(("OTP DB storage", f"Hash length: {len(code_hash) if code_hash else 0}"))
                        log(f"   ❌ FAIL: OTP not properly hashed")
                    
                    # Test wrong OTP
                    resp = client.post(
                        f"{BASE_URL}/auth/register",
                        json={
                            "name": "Test User",
                            "email": email,
                            "phone": generate_unique_phone(),
                            "password": "Str0ngPass!",
                            "otp": "000000"
                        },
                        headers=CSRF_HEADER
                    )
                    if resp.status_code == 400 and "attempt(s) left" in resp.json().get("detail", "").lower():
                        passed.append("Wrong OTP rejected")
                        log(f"   ✅ PASS: Wrong OTP rejected with attempt count")
                    else:
                        failed.append(("Wrong OTP", f"Status {resp.status_code}"))
                        log(f"   ❌ FAIL: Wrong OTP not properly rejected")
                    
                    # Test real OTP
                    resp = client.post(
                        f"{BASE_URL}/auth/register",
                        json={
                            "name": "Test User",
                            "email": email,
                            "phone": generate_unique_phone(),
                            "password": "Str0ngPass!",
                            "otp": otp
                        },
                        headers=CSRF_HEADER
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        if "customer" in data.get("roles", []):
                            passed.append("Registration with OTP")
                            log(f"   ✅ PASS: Registration successful with real OTP")
                        else:
                            failed.append(("Registration", "Missing customer role"))
                            log(f"   ❌ FAIL: Missing customer role")
                    else:
                        failed.append(("Registration", f"Status {resp.status_code}: {resp.text}"))
                        log(f"   ❌ FAIL: Registration failed: {resp.status_code}")
                else:
                    failed.append(("OTP log", "Could not read OTP from log"))
                    log(f"   ❌ FAIL: Could not read OTP from log")
            else:
                issues = []
                if has_debug:
                    issues.append("has debug_otp")
                if has_code:
                    issues.append("has 6-digit code")
                if not has_expires:
                    issues.append("wrong expires_in")
                if not has_resend:
                    issues.append("wrong resend_after")
                failed.append(("OTP response", ", ".join(issues)))
                log(f"   ❌ FAIL: {', '.join(issues)}")
        else:
            failed.append(("Send OTP", f"Status {resp.status_code}: {resp.text}"))
            log(f"   ❌ FAIL: Send OTP failed: {resp.status_code}")
except Exception as e:
    failed.append(("OTP flow", str(e)))
    log(f"   ❌ FAIL: {e}")

# Summary
log("\n" + "="*80)
log("SUMMARY")
log("="*80)
log(f"✅ Passed: {len(passed)}")
log(f"❌ Failed: {len(failed)}")

if failed:
    log("\nFailed tests:")
    for test, reason in failed:
        log(f"  - {test}: {reason}")

log("\n" + "="*80)
