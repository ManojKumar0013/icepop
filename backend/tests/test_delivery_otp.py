# Prompt 4 tests: delivery-OTP protection (5 wrong attempts lock, resend max 3, admin override with reason),
# OTP + rider details in customer notifications, notification channel switches and honest outbox records.
# Run serially: pytest /app/backend/tests/test_delivery_otp.py -n 0 -v   (needs ENABLE_TEST_OTP=true locally)
import time
import uuid

import pytest
import requests

from test_icepops_api import API, BE_ENV, H, new_session, phone, pref_time, register

RUN = uuid.uuid4().hex[:6]


@pytest.fixture(scope="module")
def admin():
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": BE_ENV["ADMIN_EMAIL"], "password": BE_ENV["ADMIN_PASSWORD"]})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def customer():
    s, _ = register(f"TEST_OTP_{RUN}", f"test_otp_{RUN}@example.com", phone())
    return s


@pytest.fixture(scope="module")
def zone_pin(admin):
    zones = [z for z in admin.get(f"{API}/admin/settings").json()["zones"] if z["is_active"]]
    assert zones, "no active delivery zone"
    return zones[0]["pincode"]


@pytest.fixture(scope="module")
def variant_id():
    products = requests.get(f"{API}/catalog/products").json()
    for p in products:
        for v in p.get("variants", []):
            if v.get("in_stock", True) and v.get("price_paise", 0) >= 2000:
                return v["id"]
    pytest.skip("no purchasable variant")


def place_delivery(customer, variant_id, pin):
    r = customer.post(f"{API}/orders", json={
        "items": [{"variant_id": variant_id, "quantity": 2}], "fulfilment_type": "delivery",
        "idempotency_key": uuid.uuid4().hex, "customer_name": "TEST OTP Customer", "customer_phone": "9876543210",
        "payment_method": "pay_on_delivery", "preferred_time": pref_time(),
        "address_line1": "TEST 1 Street", "area": "Centre", "city": "Gajapathinagaram", "pincode": pin,
    })
    assert r.status_code == 200, r.text
    return r.json()["order_number"]


def to_out_for_delivery(admin, number):
    for st in ("accepted", "preparing"):
        r = admin.post(f"{API}/admin/orders/{number}/status", json={"status": st})
        assert r.status_code == 200, r.text
    r = admin.post(f"{API}/rider/orders/{number}/claim", json={"rider_name": "Ravi Rider", "rider_phone": "9000011111"})
    assert r.status_code == 200, r.text
    o = admin.get(f"{API}/admin/orders/{number}").json()
    assert o["status"] == "out_for_delivery" and o["delivery_otp"] and len(o["delivery_otp"]) == 4
    return o


class TestRiderOtpProtection:
    def test_lock_resend_and_verify(self, admin, customer, variant_id, zone_pin):
        number = place_delivery(customer, variant_id, zone_pin)
        o = to_out_for_delivery(admin, number)
        real = o["delivery_otp"]
        assert o["otp_attempts"] == 0 and o["otp_locked"] is False and o["otp_resends"] == 0

        # Customer sees the OTP on the order page and in the in-app notification with rider details
        mine = customer.get(f"{API}/orders/{number}").json()
        assert mine["delivery_otp"] == real and mine["rider_name"] == "Ravi Rider"
        notes = customer.get(f"{API}/notifications").json()["items"]
        ofd = [n for n in notes if n["order_number"] == number and "Delivery OTP" in n["body"]]
        assert ofd and real in ofd[0]["body"] and "Ravi Rider" in ofd[0]["body"] and "9000011111" in ofd[0]["body"]

        # Rider list exposes the attempt state but never the code itself
        rider_rows = admin.get(f"{API}/rider/orders").json()["orders"]
        row = next(r for r in rider_rows if r["order_number"] == number)
        assert row["otp_attempts_left"] == 5 and "delivery_otp" not in row

        wrong = "0000" if real != "0000" else "1111"
        codes = []
        for _ in range(5):
            r = admin.post(f"{API}/rider/orders/{number}/verify-delivery", json={"otp": wrong})
            codes.append(r.status_code)
        assert codes == [400, 400, 400, 400, 423], codes
        # Locked: even the real code is refused
        r = admin.post(f"{API}/rider/orders/{number}/verify-delivery", json={"otp": real})
        assert r.status_code == 423 and "locked" in r.json()["detail"].lower()
        o = admin.get(f"{API}/admin/orders/{number}").json()
        assert o["otp_locked"] is True and o["otp_attempts"] == 5

        # Resend: new code, unlocked, counter 1/3, customer notified
        r = admin.post(f"{API}/rider/orders/{number}/resend-otp")
        assert r.status_code == 200, r.text
        assert r.json()["otp_resends"] == 1 and r.json()["otp_locked"] is False
        o = admin.get(f"{API}/admin/orders/{number}").json()
        new = o["delivery_otp"]
        assert new != real and o["otp_attempts"] == 0
        time.sleep(1)
        notes = customer.get(f"{API}/notifications").json()["items"]
        assert any(n["order_number"] == number and new in n["body"] for n in notes)

        # Old code is now invalid, new code completes the delivery (COD -> paid)
        assert admin.post(f"{API}/rider/orders/{number}/verify-delivery", json={"otp": real}).status_code == 400
        r = admin.post(f"{API}/rider/orders/{number}/verify-delivery", json={"otp": new})
        assert r.status_code == 200, r.text
        o = admin.get(f"{API}/admin/orders/{number}").json()
        assert o["status"] == "delivered" and o["payment_status"] == "paid"
        # Resend after delivery is refused
        assert admin.post(f"{API}/rider/orders/{number}/resend-otp").status_code == 400

        # Outbox: email + sms/whatsapp rows exist and are honest (no fake 'sent' for phone channels)
        time.sleep(1.5)
        o = admin.get(f"{API}/admin/orders/{number}").json()
        chans = {(n["channel"], n["status"]) for n in o["notifications"]}
        assert any(c == "email" for c, _ in chans)
        phone_rows = [n for n in o["notifications"] if n["channel"] in ("sms", "whatsapp")]
        assert phone_rows and all(n["status"] in ("skipped", "disabled") for n in phone_rows)
        assert not any(n["status"] == "not_connected" for n in o["notifications"])

    def test_resend_limit_is_three(self, admin, customer, variant_id, zone_pin):
        number = place_delivery(customer, variant_id, zone_pin)
        to_out_for_delivery(admin, number)
        for i in range(3):
            r = admin.post(f"{API}/rider/orders/{number}/resend-otp")
            assert r.status_code == 200 and r.json()["otp_resends"] == i + 1
        r = admin.post(f"{API}/rider/orders/{number}/resend-otp")
        assert r.status_code == 429
        # Clean up: deliver with the real code
        real = admin.get(f"{API}/admin/orders/{number}").json()["delivery_otp"]
        assert admin.post(f"{API}/rider/orders/{number}/verify-delivery", json={"otp": real}).status_code == 200


class TestAdminOverride:
    def test_override_requires_reason_and_is_audited(self, admin, customer, variant_id, zone_pin):
        number = place_delivery(customer, variant_id, zone_pin)
        to_out_for_delivery(admin, number)
        r = admin.post(f"{API}/admin/orders/{number}/override-delivery-otp", json={"reason": ""})
        assert r.status_code in (400, 422)
        r = admin.post(f"{API}/admin/orders/{number}/override-delivery-otp", json={"reason": "Customer phone unreachable, handed to father at door"})
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "delivered" and "unreachable" in o["otp_override_reason"]
        assert any("overridden" in (h.get("note") or "") for h in o["history"])
        logs = admin.get(f"{API}/admin/audit-logs").json()
        hit = [a for a in logs if a["action"] == "delivery_otp_override" and a["entity_id"] == number]
        assert hit and "unreachable" in hit[0]["details"]["reason"]
        # Not out for delivery any more -> second override refused
        assert admin.post(f"{API}/admin/orders/{number}/override-delivery-otp", json={"reason": "again please"}).status_code == 400

    def test_override_forbidden_for_customer(self, customer, admin, variant_id, zone_pin):
        number = place_delivery(customer, variant_id, zone_pin)
        to_out_for_delivery(admin, number)
        r = customer.post(f"{API}/admin/orders/{number}/override-delivery-otp", json={"reason": "I am the customer"})
        assert r.status_code == 403
        real = admin.get(f"{API}/admin/orders/{number}").json()["delivery_otp"]
        assert admin.post(f"{API}/rider/orders/{number}/verify-delivery", json={"otp": real}).status_code == 200


class TestChannelSettings:
    def test_toggle_channels(self, admin):
        d = admin.get(f"{API}/admin/settings").json()
        assert "notification_channels" in d and d["notification_channels"]["sms"]["configured"] is False
        assert d["notify_email_enabled"] is True
        body = {k: d[k] for k in d if k not in ("hours", "holidays", "zones", "policies", "status", "notification_channels")}
        body.update(notify_sms_enabled=True, notify_whatsapp_enabled=True)
        r = admin.put(f"{API}/admin/settings", json=body)
        assert r.status_code == 200, r.text
        assert r.json()["notify_sms_enabled"] is True and r.json()["notify_whatsapp_enabled"] is True
        body.update(notify_sms_enabled=False, notify_whatsapp_enabled=False)
        r = admin.put(f"{API}/admin/settings", json=body)
        assert r.status_code == 200 and r.json()["notify_sms_enabled"] is False
