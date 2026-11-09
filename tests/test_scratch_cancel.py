import asyncio
import httpx
import secrets

BASE_URL = "http://127.0.0.1:8000/api"
HEADERS = {
    "x-csrf-guard": "1",
    "x-forwarded-for": f"10.0.{secrets.randbelow(200) + 1}.{secrets.randbelow(200) + 1}",
}

async def run_scratch_cancellation_test():
    async with httpx.AsyncClient(base_url=BASE_URL, headers=HEADERS, timeout=30.0) as client:
        print("=== Test: Scratch Card Reversal on Order Cancellation ===")
        # 1. Register customer
        email = f"cancel_test_{secrets.token_hex(4)}@example.com"
        phone = f"91{secrets.randbelow(89999999) + 10000000}"
        r_reg = await client.post("/auth/register", json={
            "name": "Arjun Patel",
            "email": email,
            "phone": phone,
            "password": "Password123!",
        })
        assert r_reg.status_code == 200, f"Register failed: {r_reg.text}"
        user = r_reg.json()
        token = user["token"]
        headers = {**HEADERS, "Authorization": f"Bearer {token}"}

        # Check initial wallet balance
        r_w0 = await client.get("/giftcards/wallet", headers=headers)
        w0 = r_w0.json()["wallet_balance_paise"]
        print(f"Initial wallet balance: Rs.{w0 // 100}")
        assert w0 == 0

        # 2. Get variant and place order
        r_prods = await client.get("/catalog/products")
        assert r_prods.status_code == 200
        variant_id = r_prods.json()[0]["variants"][0]["id"]

        r_order = await client.post("/orders", headers=headers, json={
            "items": [{"variant_id": variant_id, "quantity": 1}],
            "fulfilment_type": "pickup",
            "customer_name": "Arjun Patel",
            "customer_phone": phone,
            "payment_method": "pay_at_pickup",
            "idempotency_key": f"order-cancel-test-{secrets.token_hex(6)}",
        })
        assert r_order.status_code == 200, f"Order placement failed: {r_order.text}"
        order = r_order.json()
        order_num = order["order_number"]
        print(f"Order #{order_num} placed successfully with status: {order['status']}")

        # 3. Claim scratch card on the active order
        r_claim = await client.post(f"/orders/{order_num}/scratch-card/claim", headers=headers)
        assert r_claim.status_code == 200, f"Claim failed: {r_claim.text}"
        reward = r_claim.json()
        reward_type = reward.get("reward_type")
        reward_paise = reward.get("amount_paise", 0)
        reward_title = (reward.get('title') or '').encode('ascii', 'ignore').decode()
        print(f"Scratch card claimed! Type: {reward_type}, Title: {reward_title}, Amount: Rs.{reward_paise // 100}")

        # Check wallet after claim
        r_w1 = await client.get("/giftcards/wallet", headers=headers)
        w1 = r_w1.json()["wallet_balance_paise"]
        print(f"Wallet balance after claiming scratch card: Rs.{w1 // 100}")
        if reward_type == "cashback":
            assert w1 == reward_paise, f"Expected wallet to have Rs.{reward_paise // 100}, got Rs.{w1 // 100}"

        # 4. Now CANCEL the order!
        print(f"\nCancelling order #{order_num}...")
        r_cancel = await client.post(f"/orders/{order_num}/cancel", headers=headers)
        assert r_cancel.status_code == 200, f"Cancel failed: {r_cancel.text}"
        cancelled_order = r_cancel.json()
        assert cancelled_order["status"] == "cancelled"
        print("Order successfully marked cancelled.")

        # 5. Check wallet balance after cancellation: scratch card cashback must be CANCELLED/REVERSED!
        r_w2 = await client.get("/giftcards/wallet", headers=headers)
        w2 = r_w2.json()["wallet_balance_paise"]
        print(f"Wallet balance after cancellation: Rs.{w2 // 100}")
        if reward_type == "cashback":
            assert w2 == 0, f"Expected wallet balance to be reversed back to 0, but found Rs.{w2 // 100}"
            print(f"VERIFIED: Rs.{reward_paise // 100} won through scratch card was successfully deducted/canceled!")

        # 6. Check wallet history ledger for the reversal transaction
        r_hist = await client.get("/giftcards/wallet/history", headers=headers)
        hist = r_hist.json()
        print("\nWallet transaction history after cancellation:")
        for t in hist:
            title_clean = t["title"].encode("ascii", "ignore").decode()
            print(f" - [{t['type'].upper()}] {title_clean}: Rs.{t['amount_paise'] // 100}")

        if reward_type == "cashback":
            reversal_entry = next((t for t in hist if "Scratch Card" in t["title"] and t["type"] == "debit"), None)
            assert reversal_entry is not None, "Reversal debit entry missing from wallet history"
            assert reversal_entry["amount_paise"] == reward_paise
            print("VERIFIED: Reversal debit entry is accurately recorded in the customer's wallet audit history.")

        # 7. Check scratch card endpoint: should report ineligible & revoked
        r_card_after = await client.get(f"/orders/{order_num}/scratch-card", headers=headers)
        card_after = r_card_after.json()
        print(f"\nScratch card status for cancelled order: eligible={card_after.get('eligible')}, revoked={card_after.get('revoked')}")
        assert card_after.get("eligible") is False
        assert card_after.get("revoked") is True

        # 8. Attempting to claim again must be rejected
        r_reclaim = await client.post(f"/orders/{order_num}/scratch-card/claim", headers=headers)
        print(f"Attempt claim on cancelled order response code: {r_reclaim.status_code}")
        assert r_reclaim.status_code == 400

        print("\nALL Scratch Card cancellation tests PASSED successfully!")

if __name__ == "__main__":
    asyncio.run(run_scratch_cancellation_test())
