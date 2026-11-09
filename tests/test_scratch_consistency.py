import asyncio
import httpx
import random

BASE_URL = "http://127.0.0.1:8000/api"

async def main():
    test_ip = f"192.168.5.{random.randint(2, 250)}"
    headers = {"x-csrf-guard": "1", "x-forwarded-for": test_ip}

    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as client:
        rand_u = random.randint(10000, 99999)
        reg_res = await client.post("/auth/register", json={
            "name": "Scratch Tester",
            "email": f"scratch_tester_{rand_u}@test.com",
            "phone": f"98777{rand_u}",
            "password": "Password123!",
        })
        assert reg_res.status_code == 200

        print(f"Testing scratch card consistency across 5 orders...")
        for i in range(1, 6):
            rand_o = random.randint(10000, 99999)
            await client.put("/cart", json={"items": [{"variant_id": 1, "quantity": 1}]})
            ord_res = await client.post("/orders", json={
                "idempotency_key": f"scratch-test-{rand_o}",
                "items": [{"variant_id": 1, "quantity": 1}],
                "fulfilment_type": "pickup",
                "customer_name": "Scratch Tester",
                "customer_phone": f"98777{rand_u}",
                "customer_email": f"scratch_tester_{rand_u}@test.com",
                "payment_method": "pay_at_pickup",
            })
            assert ord_res.status_code == 200
            order_num = ord_res.json()["order_number"]

            # 1. Fetch scratch card BEFORE claiming (what is visible under foil while scratching)
            pre_res = await client.get(f"/orders/{order_num}/scratch-card")
            assert pre_res.status_code == 200
            pre_data = pre_res.json()
            assert pre_data["eligible"] is True
            assert pre_data["claimed"] is False
            pre_title = pre_data["title"]
            pre_type = pre_data["reward_type"]
            pre_amount = pre_data["amount_paise"]
            pre_stamps = pre_data["stamps"]

            # 2. Claim scratch card AFTER scratching reaches threshold
            claim_res = await client.post(f"/orders/{order_num}/scratch-card/claim")
            assert claim_res.status_code == 200
            claim_data = claim_res.json()
            claim_title = claim_data["title"]
            claim_type = claim_data["reward_type"]
            claim_amount = claim_data["amount_paise"]
            claim_stamps = claim_data["stamps"]

            # 3. VERIFY: The outcome during scratching MUST EXACTLY MATCH the outcome after full scratches!
            assert pre_type == claim_type, f"Mismatch in type: pre={pre_type}, claim={claim_type}"
            assert pre_title == claim_title, f"Mismatch in title: pre={pre_title}, claim={claim_title}"
            assert pre_amount == claim_amount, f"Mismatch in amount: pre={pre_amount}, claim={claim_amount}"
            assert pre_stamps == claim_stamps, f"Mismatch in stamps: pre={pre_stamps}, claim={claim_stamps}"

            safe_title = claim_title.encode('ascii', 'ignore').decode()
            print(f"  [Order #{i} {order_num}]: Pre-scratch = '{safe_title}' ({claim_type}) === Post-scratch = '{safe_title}' ({claim_type}) -> 100% MATCH!")

    print("\nALL SCRATCH CONSISTENCY TESTS PASSED 100%! ZERO GLITCH, ZERO OUTCOME CHANGE!")

if __name__ == "__main__":
    asyncio.run(main())
