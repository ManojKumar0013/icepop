import asyncio
import httpx
import random

BASE_URL = "http://127.0.0.1:8000/api"

async def main():
    test_ip = f"192.168.4.{random.randint(2, 250)}"
    headers = {"x-csrf-guard": "1", "x-forwarded-for": test_ip}

    # 1. Register Referrer
    rand_ref = random.randint(10000, 99999)
    async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as ref_client:
        res_a = await ref_client.post("/auth/register", json={
            "name": f"Referrer {rand_ref}",
            "email": f"referrer_cancel_{rand_ref}@test.com",
            "phone": f"98744{rand_ref}",
            "password": "Password123!",
        })
        assert res_a.status_code == 200, f"Register referrer failed: {res_a.text}"

        ref_wallet0 = (await ref_client.get("/giftcards/wallet")).json()["wallet_balance_paise"]
        assert ref_wallet0 == 0
        ref_data0 = (await ref_client.get("/giftcards/referral")).json()
        ref_code = ref_data0["referral_code"]
        print(f"[OK] Referrer created: {ref_code}, initial wallet: Rs.{ref_wallet0 // 100}")

        # 2. Friend registers with Referrer's code
        rand_f = random.randint(10000, 99999)
        async with httpx.AsyncClient(base_url=BASE_URL, headers=headers, timeout=30.0) as f_client:
            f_reg = await f_client.post("/auth/register", json={
                "name": "Friend Charlie",
                "email": f"charlie_{rand_f}@test.com",
                "phone": f"98755{rand_f}",
                "password": "Password123!",
                "referral_code": ref_code,
            })
            assert f_reg.status_code == 200

            # Friend places first order
            await f_client.put("/cart", json={"items": [{"variant_id": 1, "quantity": 2}]})
            ord_res = await f_client.post("/orders", json={
                "idempotency_key": f"test-cancel-{rand_f}",
                "items": [{"variant_id": 1, "quantity": 2}],
                "fulfilment_type": "pickup",
                "customer_name": "Friend Charlie",
                "customer_phone": f"98755{rand_f}",
                "customer_email": f"charlie_{rand_f}@test.com",
                "payment_method": "pay_at_pickup",
            })
            assert ord_res.status_code == 200, f"Order failed: {ord_res.text}"
            order_data = ord_res.json()
            order_num = order_data["order_number"]
            print(f"[OK] Order #{order_num} placed.")

            # Check wallet balances after order placement: both should have Rs.10
            f_wallet1 = (await f_client.get("/giftcards/wallet")).json()["wallet_balance_paise"]
            ref_wallet1 = (await ref_client.get("/giftcards/wallet")).json()["wallet_balance_paise"]
            assert f_wallet1 == 1000, f"Expected Friend wallet 1000 paise, got {f_wallet1}"
            assert ref_wallet1 == 1000, f"Expected Referrer wallet 1000 paise, got {ref_wallet1}"
            print("[OK] Referral bonus credited to both: Friend=Rs.10, Referrer=Rs.10")

            # Check Referrer tracking: Completed=1, Pending=0
            ref_track1 = (await ref_client.get("/giftcards/referral")).json()
            assert ref_track1["completed_count"] == 1
            assert ref_track1["pending_count"] == 0
            print("[OK] Referrer tracking shows 1 Completed friend.")

            # 3. Friend CANCELS the order!
            cancel_res = await f_client.post(f"/orders/{order_num}/cancel")
            assert cancel_res.status_code == 200, f"Cancel failed: {cancel_res.text}"
            print(f"[OK] Order #{order_num} cancelled successfully.")

            # 4. Verify wallet balances after cancellation: BOTH referral bonuses must be reversed!
            f_wallet2 = (await f_client.get("/giftcards/wallet")).json()["wallet_balance_paise"]
            ref_wallet2 = (await ref_client.get("/giftcards/wallet")).json()["wallet_balance_paise"]
            assert f_wallet2 == 0, f"Expected Friend wallet to be Rs.0 after cancellation, got Rs.{f_wallet2 // 100}"
            assert ref_wallet2 == 0, f"Expected Referrer wallet to be Rs.0 after cancellation, got Rs.{ref_wallet2 // 100}"
            print(f"[OK] VERIFIED: Both referral amounts successfully reversed on cancellation! (Friend=Rs.{f_wallet2 // 100}, Referrer=Rs.{ref_wallet2 // 100})")

            # 5. Verify Referrer tracking after cancellation: Completed=0, Pending=1
            ref_track2 = (await ref_client.get("/giftcards/referral")).json()
            assert ref_track2["completed_count"] == 0, f"Expected 0 completed, got {ref_track2['completed_count']}"
            assert ref_track2["pending_count"] == 1, f"Expected 1 pending, got {ref_track2['pending_count']}"
            assert ref_track2["total_earned_paise"] == 0
            print("[OK] VERIFIED: Referrer tracking reverted friend back to Pending awaiting a non-cancelled order.")

            # 6. Check transaction history of both parties
            f_history = (await f_client.get("/giftcards/wallet/history")).json()
            f_debit = next((t for t in f_history if t.get("type") == "debit"), None)
            assert f_debit is not None, "Expected debit reversal entry in Friend's wallet history"
            assert f_debit["amount_paise"] == 1000
            print(f"[OK] Friend ledger shows: {f_debit['title'].encode('ascii', 'ignore').decode()} (-Rs.{f_debit['amount_paise'] // 100})")

            ref_history = (await ref_client.get("/giftcards/wallet/history")).json()
            ref_debit = next((t for t in ref_history if t.get("type") == "debit"), None)
            assert ref_debit is not None, "Expected debit reversal entry in Referrer's wallet history"
            assert ref_debit["amount_paise"] == 1000
            print(f"[OK] Referrer ledger shows: {ref_debit['title'].encode('ascii', 'ignore').decode()} (-Rs.{ref_debit['amount_paise'] // 100})")

    print("\nALL REFERRAL CANCELLATION TESTS PASSED 100% PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(main())
