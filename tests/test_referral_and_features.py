import asyncio
import httpx
import secrets

BASE_URL = "http://127.0.0.1:8000/api"
RUN_ID = secrets.token_hex(3)
HEADERS = {
    "x-csrf-guard": "1",
    "x-forwarded-for": f"10.0.{secrets.randbelow(200) + 1}.{secrets.randbelow(200) + 1}",
}

async def run_tests():
    async with httpx.AsyncClient(base_url=BASE_URL, headers=HEADERS, timeout=30.0) as client:
        print("=== Test 1: Health Check ===")
        r = await client.get("/")
        assert r.status_code == 200, f"Status failed: {r.text}"
        print("API Health OK")

        print("\n=== Test 2: User A Registration & Referral Code ===")
        email_a = f"usera_{secrets.token_hex(4)}@example.com"
        phone_a = f"98{secrets.randbelow(89999999) + 10000000}"
        r_a = await client.post("/auth/register", json={
            "name": "Manoj Kumar",
            "email": email_a,
            "phone": phone_a,
            "password": "Password123!",
        })
        assert r_a.status_code == 200, f"Register A failed: {r_a.text}"
        user_a = r_a.json()
        token_a = user_a["token"]
        headers_a = {**HEADERS, "Authorization": f"Bearer {token_a}"}

        r_ref = await client.get("/giftcards/referral", headers=headers_a)
        assert r_ref.status_code == 200, f"Referral A failed: {r_ref.text}"
        ref_data_a = r_ref.json()
        code_a = ref_data_a["referral_code"]
        print(f"User A registered. Code: {code_a}, Reward per referral: Rs.{ref_data_a['reward_per_referral_paise'] // 100}")
        assert ref_data_a["reward_per_referral_paise"] == 1000, "Expected reward to be 1000 paise (Rs.10)"

        # Check User A wallet
        r_w_a = await client.get("/giftcards/wallet", headers=headers_a)
        assert r_w_a.json()["wallet_balance_paise"] == 0, "User A wallet should be 0 before referrals"

        print("\n=== Test 3: User B Signs Up with Referral Code (Pre-order verification) ===")
        email_b = f"userb_{secrets.token_hex(4)}@example.com"
        phone_b = f"97{secrets.randbelow(89999999) + 10000000}"
        r_b = await client.post("/auth/register", json={
            "name": "Priya Sharma",
            "email": email_b,
            "phone": phone_b,
            "password": "Password123!",
            "referral_code": code_a,
        })
        assert r_b.status_code == 200, f"Register B failed: {r_b.text}"
        user_b = r_b.json()
        token_b = user_b["token"]
        headers_b = {**HEADERS, "Authorization": f"Bearer {token_b}"}

        # Verify BOTH wallets are STILL 0 (Condition: only credited AFTER new person places order!)
        r_wb0 = await client.get("/giftcards/wallet", headers=headers_b)
        assert r_wb0.json()["wallet_balance_paise"] == 0, "User B wallet should be 0 immediately after signup!"
        r_wa0 = await client.get("/giftcards/wallet", headers=headers_a)
        assert r_wa0.json()["wallet_balance_paise"] == 0, "User A wallet should be 0 before User B places order!"
        print("Verified: Neither User A nor User B has received Rs.10 prior to order placement.")

        print("\n=== Test 4: User B Places First Order ===")
        # Get active products/variants
        r_menu = await client.get("/catalog/products")
        assert r_menu.status_code == 200, f"Products failed: {r_menu.text}"
        products = r_menu.json()
        variant_id = products[0]["variants"][0]["id"]
        print(f"Selected variant ID {variant_id} for order test")

        # Place pickup order with delivery partner tip test as well (or delivery order)
        idem_key = f"test-order-{secrets.token_hex(6)}"
        r_order = await client.post("/orders", headers=headers_b, json={
            "items": [{"variant_id": variant_id, "quantity": 1}],
            "fulfilment_type": "pickup",
            "customer_name": "Priya Sharma",
            "customer_phone": phone_b,
            "payment_method": "pay_at_pickup",
            "idempotency_key": idem_key,
            "tip_paise": 0,
        })
        assert r_order.status_code == 200, f"Order placement failed: {r_order.text}"
        order_b = r_order.json()
        order_num = order_b["order_number"]
        print(f"User B first order placed successfully! Order #{order_num}")

        # Now check User B wallet: should have Rs.10 (1000 paise)!
        r_wb1 = await client.get("/giftcards/wallet", headers=headers_b)
        wb1_balance = r_wb1.json()["wallet_balance_paise"]
        print(f"User B wallet balance after first order: Rs.{wb1_balance // 100}")
        assert wb1_balance == 1000, f"User B should have Rs.10 (1000 paise) in wallet, got {wb1_balance}"

        # Now check User A wallet: should have Rs.10 (1000 paise)!
        r_wa1 = await client.get("/giftcards/wallet", headers=headers_a)
        wa1_balance = r_wa1.json()["wallet_balance_paise"]
        print(f"User A (referrer) wallet balance after first order: Rs.{wa1_balance // 100}")
        assert wa1_balance == 1000, f"User A should have Rs.10 (1000 paise) in wallet, got {wa1_balance}"

        # Check User B wallet history ledger
        r_hist_b = await client.get("/giftcards/wallet/history", headers=headers_b)
        hist_b = r_hist_b.json()
        print(f"User B wallet history: {hist_b[0]['title'].encode('ascii', 'ignore').decode()} - Rs.{hist_b[0]['amount_paise'] // 100}")
        assert any("Welcome Referral Bonus" in t["title"] and t["amount_paise"] == 1000 for t in hist_b), "User B history missing welcome bonus"

        # Check User A wallet history ledger
        r_hist_a = await client.get("/giftcards/wallet/history", headers=headers_a)
        hist_a = r_hist_a.json()
        print(f"User A wallet history: {hist_a[0]['title'].encode('ascii', 'ignore').decode()} - Rs.{hist_a[0]['amount_paise'] // 100}")
        assert any("Friend Referral Bonus" in t["title"] and t["amount_paise"] == 1000 for t in hist_a), "User A history missing referral bonus"

        print("\n=== Test 5: User B Places a Second Order (No duplicate bonus) ===")
        idem_key_2 = f"test-order-2-{secrets.token_hex(6)}"
        r_order2 = await client.post("/orders", headers=headers_b, json={
            "items": [{"variant_id": variant_id, "quantity": 1}],
            "fulfilment_type": "pickup",
            "customer_name": "Priya Sharma",
            "customer_phone": phone_b,
            "payment_method": "pay_at_pickup",
            "idempotency_key": idem_key_2,
        })
        assert r_order2.status_code == 200

        # Check balances remain exactly Rs.10 (not duplicated)
        r_wb2 = await client.get("/giftcards/wallet", headers=headers_b)
        assert r_wb2.json()["wallet_balance_paise"] == 1000, "User B bonus should not duplicate on second order"
        r_wa2 = await client.get("/giftcards/wallet", headers=headers_a)
        assert r_wa2.json()["wallet_balance_paise"] == 1000, "User A bonus should not duplicate on second order"
        print("Verified: Referral bonus is credited only once (on the first order).")

        print("\n=== Test 6: Scratch Card Reward Distribution Check ===")
        r_card = await client.get(f"/orders/{order_num}/scratch-card", headers=headers_b)
        assert r_card.status_code == 200, f"Scratch card check failed: {r_card.text}"
        card_info = r_card.json()
        print(f"Scratch card eligible: {card_info.get('eligible')}, claimed: {card_info.get('claimed')}")
        assert card_info.get("eligible") is True, "Scratch card should be eligible"

        # Claim the card
        r_claim = await client.post(f"/orders/{order_num}/scratch-card/claim", headers=headers_b)
        assert r_claim.status_code == 200, f"Claim failed: {r_claim.text}"
        res = r_claim.json()
        title_clean = (res.get('title') or '').encode('ascii', 'ignore').decode()
        print(f"Scratch card claimed! Type: {res.get('reward_type')}, Title: {title_clean}, Amount: {res.get('amount_paise')}")
        assert res.get("reward_type") in ("cashback", "free_delivery", "loyalty_stamps"), f"Invalid reward type: {res}"

        print("\n=== Test 7: Delivery Rider Tip at Checkout ===")
        idem_tip = f"test-order-tip-{secrets.token_hex(6)}"
        r_tip_order = await client.post("/orders", headers=headers_a, json={
            "items": [{"variant_id": variant_id, "quantity": 1}],
            "fulfilment_type": "delivery",
            "customer_name": "Manoj Kumar",
            "customer_phone": phone_a,
            "address_line1": "Flat 402, Lotus Tower",
            "area": "Banjara Hills",
            "city": "Hyderabad",
            "pincode": "500034",
            "payment_method": "pay_on_delivery",
            "idempotency_key": idem_tip,
            "tip_paise": 2000, # Rs.20 tip
        })
        assert r_tip_order.status_code == 200, f"Delivery order with tip failed: {r_tip_order.text}"
        tip_order = r_tip_order.json()
        tip_val = tip_order.get("tip_paise", 0)
        print(f"Tip in order: Rs.{tip_val // 100}")
        assert tip_val == 2000, f"Tip of Rs.20 should be saved, got {tip_val}"

        print("\nAll automated integration tests PASSED flawlessly!")

if __name__ == "__main__":
    asyncio.run(run_tests())
