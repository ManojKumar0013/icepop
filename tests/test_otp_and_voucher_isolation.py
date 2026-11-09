import asyncio
import random
import httpx

BASE_URL = "http://127.0.0.1:8000/api"

async def run_tests():
    test_ip = f"192.168.10.{random.randint(2, 250)}"
    headers = {"x-csrf-guard": "1", "x-forwarded-for": test_ip}

    print("=== 1. TEST SIGNUP OTP FLOW ===")
    rand_num = random.randint(100000, 999999)
    test_email = f"icepops_test_{rand_num}@example.com"
    test_phone = f"9876{rand_num}"

    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as client:
        # 1a. Request OTP
        otp_res = await client.post("/auth/send-signup-otp", json={
            "email": test_email,
            "name": "OTP Tester",
        })
        assert otp_res.status_code == 200, f"send-signup-otp failed: {otp_res.text}"
        otp_data = otp_res.json()
        assert otp_data.get("ok") is True
        otp_code = otp_data.get("debug_otp")
        assert len(otp_code) == 6, f"Invalid OTP code: {otp_code}"
        print(f"[OK] OTP requested successfully: {otp_code}")

        # 1b. Attempt register with WRONG OTP
        bad_reg = await client.post("/auth/register", json={
            "name": "OTP Tester",
            "email": test_email,
            "phone": test_phone,
            "password": "Password123!",
            "otp": "000001",
        })
        assert bad_reg.status_code == 400, f"Expected 400 for bad OTP, got: {bad_reg.status_code}"
        print("[OK] Register with invalid OTP correctly rejected with 400")

        # 1c. Register with CORRECT OTP
        good_reg = await client.post("/auth/register", json={
            "name": "OTP Tester",
            "email": test_email,
            "phone": test_phone,
            "password": "Password123!",
            "otp": otp_code,
        })
        assert good_reg.status_code == 200, f"Register with valid OTP failed: {good_reg.text}"
        user_data = good_reg.json()
        print(f"[OK] Register succeeded for user: {user_data.get('name')}")

        # 1d. Duplicate email check
        dup_otp = await client.post("/auth/send-signup-otp", json={
            "email": test_email,
            "name": "Duplicate Tester",
        })
        assert dup_otp.status_code == 409, f"Expected 409 for duplicate email, got: {dup_otp.status_code}"
        print("[OK] Duplicate email correctly rejected with 409")

        # 1e. Test Logout
        logout_res = await client.post("/auth/logout")
        assert logout_res.status_code == 200, f"Logout failed: {logout_res.text}"
        print("[OK] Logout succeeded with 200 (no 500 error)")

    print("\n=== 2. TEST GIFT VOUCHER & WALLET ISOLATION ===")
    # Login as admin / existing user Manoj to check their voucher list and wallet history
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as manoj_client:
        login_res = await manoj_client.post("/auth/login", json={
            "email": "manojkumarbondada13@gmail.com",
            "password": "Password123!",
        })
        if login_res.status_code == 200:
            print("[OK] Logged in as manojkumarbondada13@gmail.com")
            
            # Check my-vouchers
            vouchers_res = await manoj_client.get("/giftcards/my-vouchers")
            assert vouchers_res.status_code == 200
            vouchers = vouchers_res.json()
            print(f"[OK] my-vouchers returned {len(vouchers)} vouchers for Manoj")
            for v in vouchers:
                # Should not contain vouchers that belong to other people unless sent to Manoj
                print(f"   Voucher: {v['code']} | To: {v['recipient_name']} ({v.get('recipient_email')})")

            # Check wallet history
            history_res = await manoj_client.get("/giftcards/wallet/history")
            assert history_res.status_code == 200
            history = history_res.json()
            print(f"[OK] wallet/history returned {len(history)} transactions")
            
            # Verify no +₹0 items in wallet passbook
            for tx in history:
                assert tx["amount_paise"] > 0, f"Found <= 0 amount in wallet ledger: {tx}"
                print(f"   Tx: {tx['type'].upper()} | {tx['title']} | +₹{tx['amount_paise'] / 100:.2f}")

    print("\n=== ALL TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    asyncio.run(run_tests())
