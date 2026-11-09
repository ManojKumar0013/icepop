import asyncio
import httpx
import random

BASE_URL = "http://127.0.0.1:8000/api"

async def main():
    test_ip = f"192.168.2.{random.randint(2, 250)}"
    headers = {"x-csrf-guard": "1", "x-forwarded-for": test_ip}

    # 1. Referrer Client
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as ref_client:
        res_a = await ref_client.post("/auth/register", json={
            "name": "Friend Referrer",
            "email": "friend_ref_user@test.com",
            "phone": "9876543299",
            "password": "Password123!",
        })
        if res_a.status_code in (400, 409):
            res_a = await ref_client.post("/auth/login", json={
                "email": "friend_ref_user@test.com",
                "password": "Password123!",
            })
        assert res_a.status_code == 200, f"Referrer login failed: {res_a.text}"

        ref_res = await ref_client.get("/giftcards/referral")
        assert ref_res.status_code == 200, f"Get referral failed: {ref_res.text}"
        ref_data = ref_res.json()
        ref_code = ref_data["referral_code"]
        print(f"[OK] Referrer code obtained: {ref_code}")

    # 2. New Customer Client
    rand_id = random.randint(10000, 99999)
    email_b = f"new_fixed_{rand_id}@test.com"
    phone_b = f"98765{rand_id}"

    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as b_client:
        res_b = await b_client.post("/auth/register", json={
            "name": "New Customer",
            "email": email_b,
            "phone": phone_b,
            "password": "Password123!",
        })
        assert res_b.status_code == 200, f"Register user B failed: {res_b.text}"

        # 3. Check User B initial referral status
        b_ref = await b_client.get("/giftcards/referral")
        assert b_ref.status_code == 200
        b_data = b_ref.json()
        assert b_data["has_completed_order"] is False
        assert b_data["referred_by_code"] is None
        print(f"[OK] User B initial referral status: has_completed_order={b_data['has_completed_order']}")

        # 4. User B enters referral code for the first time
        apply_res = await b_client.post("/giftcards/referral/apply", json={"code": ref_code})
        assert apply_res.status_code == 200, f"Apply referral code failed: {apply_res.text}"
        apply_json = apply_res.json()
        assert apply_json["referred_by_code"] == ref_code
        print(f"[OK] Applied friend's code {ref_code}")

        # 5. VERIFY FIXED: Try to edit/change to another referral code -> MUST FAIL (400)
        reapply_res = await b_client.post("/giftcards/referral/apply", json={"code": "OTHER10"})
        assert reapply_res.status_code == 400, f"Expected 400 when attempting to change fixed code, got: {reapply_res.status_code}"
        assert "cannot be modified" in reapply_res.text or "already been linked" in reapply_res.text
        print(f"[OK] VERIFIED: Attempt to edit/change referral code blocked with 400: {reapply_res.json()['detail']}")

        # 6. VERIFY FIXED: Try to remove referral code -> MUST FAIL (400)
        delete_res = await b_client.delete("/giftcards/referral/apply")
        assert delete_res.status_code == 400, f"Expected 400 when attempting to remove code, got: {delete_res.status_code}"
        assert "permanently locked" in delete_res.text or "cannot be edited" in delete_res.text
        print(f"[OK] VERIFIED: Attempt to remove referral code blocked with 400: {delete_res.json()['detail']}")

        # 7. Check that code remains fixed and active
        b_ref_fixed = await b_client.get("/giftcards/referral")
        assert b_ref_fixed.json()["referred_by_code"] == ref_code
        print(f"[OK] Code {ref_code} remains permanently locked in account.")

        # 8. User B places an order
        cart_res = await b_client.put("/cart", json={
            "items": [{"variant_id": 1, "quantity": 3}],
        })
        assert cart_res.status_code == 200

        order_res = await b_client.post("/orders", json={
            "idempotency_key": f"test-fixed-{rand_id}",
            "items": [{"variant_id": 1, "quantity": 3}],
            "fulfilment_type": "delivery",
            "customer_name": "New Customer",
            "customer_phone": phone_b,
            "customer_email": email_b,
            "address_line1": "Flat 101, Main Road",
            "area": "Banjara Hills",
            "city": "Hyderabad",
            "pincode": "500034",
            "payment_method": "pay_on_delivery",
        })
        assert order_res.status_code == 200, f"Order placement failed: {order_res.text}"
        order_data = order_res.json()
        print(f"[OK] Order placed successfully: #{order_data['order_number']}")

        # 9. After order completed: has_completed_order MUST be True (box becomes invisible)
        b_ref_after = await b_client.get("/giftcards/referral")
        assert b_ref_after.json()["has_completed_order"] is True
        print("[OK] After order placed: has_completed_order=True (box is now completely invisible)")

    print("\nALL FIXED REFERRAL TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(main())
