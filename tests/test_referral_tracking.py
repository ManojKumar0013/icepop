import asyncio
import httpx
import random

BASE_URL = "http://127.0.0.1:8000/api"

async def main():
    test_ip = f"192.168.3.{random.randint(2, 250)}"
    headers = {"x-csrf-guard": "1", "x-forwarded-for": test_ip}

    # 1. Referrer Client
    rand_ref = random.randint(10000, 99999)
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as ref_client:
        res_a = await ref_client.post("/auth/register", json={
            "name": f"Main Referrer {rand_ref}",
            "email": f"main_referrer_{rand_ref}@test.com",
            "phone": f"98711{rand_ref}",
            "password": "Password123!",
        })
        assert res_a.status_code == 200, f"Register referrer failed: {res_a.text}"

        ref_data = (await ref_client.get("/giftcards/referral")).json()
        ref_code = ref_data["referral_code"]
        print(f"[OK] Referrer created: {ref_data.get('referral_code')}")
        assert ref_data["completed_count"] == 0
        assert ref_data["pending_count"] == 0

        # 2. Friend 1 (Pending: enters code, does NOT order)
        rand_p = random.randint(10000, 99999)
        async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as p_client:
            p_reg = await p_client.post("/auth/register", json={
                "name": "Pending Friend Alice",
                "email": f"alice_{rand_p}@test.com",
                "phone": f"98722{rand_p}",
                "password": "Password123!",
                "referral_code": ref_code,
            })
            assert p_reg.status_code == 200

        # Check Referrer status: 1 Pending, 0 Completed
        ref_check1 = (await ref_client.get("/giftcards/referral")).json()
        assert ref_check1["pending_count"] == 1, f"Expected 1 pending, got {ref_check1['pending_count']}"
        assert ref_check1["completed_count"] == 0
        assert len(ref_check1["pending_referrals"]) == 1
        assert ref_check1["pending_referrals"][0]["name"] == "Pending Friend Alice"
        print(f"[OK] Pending friend verified: {ref_check1['pending_referrals'][0]['name']} (Status: {ref_check1['pending_referrals'][0]['status_label']})")

        # 3. Friend 2 (Completed: enters code, places first order)
        rand_c = random.randint(10000, 99999)
        async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as c_client:
            c_reg = await c_client.post("/auth/register", json={
                "name": "Completed Friend Bob",
                "email": f"bob_{rand_c}@test.com",
                "phone": f"98733{rand_c}",
                "password": "Password123!",
                "referral_code": ref_code,
            })
            assert c_reg.status_code == 200

            # Bob adds to cart and places first order
            await c_client.put("/cart", json={"items": [{"variant_id": 1, "quantity": 2}]})
            ord_res = await c_client.post("/orders", json={
                "idempotency_key": f"test-track-{rand_c}",
                "items": [{"variant_id": 1, "quantity": 2}],
                "fulfilment_type": "pickup",
                "customer_name": "Completed Friend Bob",
                "customer_phone": f"98733{rand_c}",
                "customer_email": f"bob_{rand_c}@test.com",
                "payment_method": "pay_at_pickup",
            })
            assert ord_res.status_code == 200, f"Order failed: {ord_res.text}"
            order_num = ord_res.json()["order_number"]

        # Check Referrer status: 1 Pending, 1 Completed!
        ref_check2 = (await ref_client.get("/giftcards/referral")).json()
        assert ref_check2["pending_count"] == 1, f"Expected 1 pending, got {ref_check2['pending_count']}"
        assert ref_check2["completed_count"] == 1, f"Expected 1 completed, got {ref_check2['completed_count']}"
        assert ref_check2["total_referrals"] == 2
        assert ref_check2["total_earned_paise"] == 1000

        # Verify details of who they are
        completed_friend = ref_check2["completed_referrals"][0]
        pending_friend = ref_check2["pending_referrals"][0]

        assert completed_friend["name"] == "Completed Friend Bob"
        assert completed_friend["order_number"] == order_num
        assert completed_friend["earned_paise"] == 1000
        assert completed_friend["status"] == "completed"

        assert pending_friend["name"] == "Pending Friend Alice"
        assert pending_friend["status"] == "pending"

        print(f"[OK] Completed friend verified: {completed_friend['name']}, Order: #{completed_friend['order_number']}, Earned: Rs.{completed_friend['earned_paise'] // 100}")
        print(f"[OK] Pending friend verified: {pending_friend['name']}, Status: {pending_friend['status_label']}")
        print(f"[OK] Referrer wallet earned: Rs.{ref_check2['total_earned_paise'] // 100}")

    print("\nALL REFERRAL TRACKING TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(main())
