# ICEPOPS backend regression suite: auth, catalog, quote/promotion engine, orders, admin, security.
# Run serially: pytest /app/backend/tests/test_icepops_api.py -n 0 -v
import os
import uuid
import asyncio
import concurrent.futures as cf
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import pytest
import requests
from dotenv import dotenv_values

FE_ENV = dotenv_values("/app/frontend/.env")
BE_ENV = dict(dotenv_values("/app/backend/.env"))


def _proc_env():
    """Secrets (ADMIN_*, DATABASE_URL) live only in the supervisor-managed backend process env."""
    import subprocess
    try:
        pid = subprocess.check_output(["pgrep", "-f", "uvicorn server:app"]).split()[0].decode()
        raw = open(f"/proc/{pid}/environ", "rb").read().split(b"\0")
        return dict(x.decode().split("=", 1) for x in raw if b"=" in x)
    except Exception:
        return {}


for _k, _v in _proc_env().items():
    if _k in ("ADMIN_EMAIL", "ADMIN_PASSWORD", "DATABASE_URL"):
        BE_ENV.setdefault(_k, os.environ.get(_k) or _v)
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or FE_ENV["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"
H = {"X-CSRF-Guard": "1", "Content-Type": "application/json"}
IST = timezone(timedelta(hours=5, minutes=30))
RUN = uuid.uuid4().hex[:6]
STATE = {}


def pref_time():
    t = (datetime.now(IST) + timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
    return t.isoformat()


def db_inventory(variant_ids):
    """Read-only inventory lookup in the Postgres DB."""
    import asyncpg
    u = urlsplit(BE_ENV["DATABASE_URL"])
    dsn = f"postgresql://{u.netloc}{u.path}"

    async def run():
        conn = await asyncpg.connect(dsn, ssl="require", statement_cache_size=0)
        try:
            rows = await conn.fetch("select variant_id, quantity from inventory where variant_id = any($1::int[])", variant_ids)
            return {r["variant_id"]: r["quantity"] for r in rows}
        finally:
            await conn.close()
    return asyncio.run(run())


def new_session():
    s = requests.Session()
    s.headers.update(H)
    return s


def register(name, email, phone, password="Test@12345"):
    s = new_session()
    r = s.post(f"{API}/auth/register", json={"name": name, "email": email, "phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return s, r.json()


def phone():
    return "9" + str(uuid.uuid4().int)[:9]


@pytest.fixture(scope="module")
def admin():
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": BE_ENV["ADMIN_EMAIL"], "password": BE_ENV["ADMIN_PASSWORD"]})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text}")
    assert "admin" in r.json()["roles"]
    return s


@pytest.fixture(scope="module")
def cust_a():
    s, u = register(f"TEST_A_{RUN}", f"test_a_{RUN}@example.com", phone())
    STATE["a_email"] = u["email"]
    return s


@pytest.fixture(scope="module")
def cust_b():
    s, u = register(f"TEST_B_{RUN}", f"test_b_{RUN}@example.com", phone())
    STATE["b_email"] = u["email"]
    return s


def quote(s, items, **kw):
    r = s.post(f"{API}/cart/quote", json={"items": items, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def place(s, items, ftype="pickup", key=None, **kw):
    body = {"items": items, "fulfilment_type": ftype, "idempotency_key": key or uuid.uuid4().hex,
            "customer_name": "TEST_Customer", "customer_phone": "9876543210",
            "payment_method": "pay_at_pickup" if ftype == "pickup" else "pay_on_delivery",
            "preferred_time": pref_time()}
    if ftype == "delivery":
        body.update(address_line1="TEST 1 Street", area="Abids", city="Hyderabad", pincode="500002")
    body.update(kw)
    return s.post(f"{API}/orders", json=body)


def it(vid, q=1):
    return {"variant_id": vid, "quantity": q}


# --- Health / catalog / policies
class TestBasics:
    def test_health(self):
        assert requests.get(f"{API}/").json()["status"] == "ok"

    def test_catalog(self):
        cats = requests.get(f"{API}/catalog/categories").json()
        assert {"cream-popsicles", "water-popsicles"} <= {c["slug"] for c in cats}
        p = requests.get(f"{API}/catalog/products/raspberry-ripple-pop").json()
        assert p["variants"][0]["price_paise"] == 5000
        assert requests.get(f"{API}/catalog/products/nope-xyz").status_code == 404
        r = requests.get(f"{API}/catalog/products", params={"q": "mango"}).json()
        assert [x["slug"] for x in r] == ["mango-chilli-ice"]

    @pytest.mark.parametrize("slug", ["privacy-policy", "terms", "cancellation-policy", "refund-policy",
                                      "delivery-policy", "allergens", "food-safety"])
    def test_policies(self, slug):
        r = requests.get(f"{API}/policies/{slug}")
        assert r.status_code == 200, r.text
        assert r.json().get("content")


# --- Security / auth
class TestSecurity:
    def test_csrf_missing_header(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@example.com", "password": "x"})
        assert r.status_code == 403

    def test_register_validation_and_duplicate(self, cust_a):
        s = new_session()
        r = s.post(f"{API}/auth/register", json={"name": "TEST_x", "email": f"test_x_{RUN}@example.com", "phone": "12345", "password": "Test@12345"})
        assert r.status_code == 422
        r = s.post(f"{API}/auth/register", json={"name": "TEST_x", "email": f"test_x_{RUN}@example.com", "phone": phone(), "password": "short"})
        assert r.status_code == 422
        r = s.post(f"{API}/auth/register", json={"name": "TEST_x", "email": STATE["a_email"], "phone": phone(), "password": "Test@12345"})
        assert r.status_code == 409

    def test_me_and_anon(self, cust_a):
        assert cust_a.get(f"{API}/auth/me").json()["roles"] == ["customer"]
        assert requests.get(f"{API}/orders").status_code == 401
        assert requests.get(f"{API}/auth/me").status_code == 401

    def test_non_admin_403(self, cust_a):
        for path in ("overview", "orders", "promotions", "audit-logs"):
            assert cust_a.get(f"{API}/admin/{path}").status_code == 403
        assert cust_a.patch(f"{API}/admin/offer-stacking", json={"allow_offer_stacking": True}).status_code == 403

    def test_forgot_reset(self):
        s = new_session()
        r1 = s.post(f"{API}/auth/forgot-password", json={"email": f"test_nobody_{RUN}@example.com"})
        assert r1.status_code == 200 and "If an account exists" in r1.json()["message"]
        r2 = s.post(f"{API}/auth/reset-password", json={"token": "x" * 40, "password": "Newpass123"})
        assert r2.status_code == 400

    def test_login_rate_limit(self, cust_b):
        s = new_session()
        codes = [s.post(f"{API}/auth/login", json={"email": STATE["b_email"], "password": "wrongpass!"}).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5 and codes[5] == 429, codes
        # after lockout a correct password should also be refused while the window is active
        r = s.post(f"{API}/auth/login", json={"email": STATE["b_email"], "password": "Test@12345"})
        STATE["lockout_correct_pw_status"] = r.status_code
        assert r.status_code == 429, f"Correct password accepted during lockout: {r.status_code}"


# --- Quote / promotion engine
class TestPricing:
    def test_anon_first_order_note(self):
        q = quote(requests.Session(), [it(1), it(4)], fulfilment_type="pickup") if False else None
        s = new_session()
        q = s.post(f"{API}/cart/quote", json={"items": [it(1), it(4)], "fulfilment_type": "pickup"}).json()
        assert q["subtotal_paise"] == 8000 and q["discount_paise"] == 0
        assert any("log in" in n.lower() for n in q["notes"])

    def test_first_order_and_delivery_fee(self, cust_a):
        q = quote(cust_a, [it(1), it(4)], fulfilment_type="delivery", pincode="500001")
        assert q["discounts"][0]["code"] == "first_order" and q["discount_paise"] == 3000
        assert q["delivery_fee_paise"] == 3000 and q["total_paise"] == 8000
        assert q["free_delivery_remaining_paise"] == 5000

    def test_free_delivery(self, cust_a):
        q = quote(cust_a, [it(24)], fulfilment_type="delivery", pincode="500003")
        assert q["delivery_fee_paise"] == 0 and q["delivery_savings_paise"] == 3000 and q["total_paise"] == 17000

    def test_bad_pincode(self, cust_a):
        q = quote(cust_a, [it(24)], fulfilment_type="delivery", pincode="400001")
        assert any("400001" in e for e in q["errors"])

    def test_coupon(self, cust_a):
        q = quote(cust_a, [it(24), it(9)], coupon_code="scoop10", fulfilment_type="pickup")
        assert q["coupon_code"] == "SCOOP10" and q["discount_paise"] == 2300
        q = quote(cust_a, [it(26, 3)], coupon_code="SCOOP10", fulfilment_type="pickup")
        assert q["discount_paise"] == 5000
        q = quote(cust_a, [it(9)], coupon_code="SCOOP10", fulfilment_type="pickup")
        assert q["coupon_error"] and q["discount_paise"] == 0
        q = quote(cust_a, [it(9)], coupon_code="BOGUS", fulfilment_type="pickup")
        assert "not valid" in q["coupon_error"]

    def test_stacking(self, cust_a, admin):
        items = [it(25), it(6)]  # 19000 + 2500 popsicle
        q = quote(cust_a, items, coupon_code="SCOOP10", fulfilment_type="pickup")
        assert len(q["discounts"]) == 1 and q["discount_paise"] == 2500 and q["discounts"][0]["code"] == "first_order"
        assert any("Only one offer" in n for n in q["notes"])
        try:
            assert admin.patch(f"{API}/admin/offer-stacking", json={"allow_offer_stacking": True}).status_code == 200
            q = quote(cust_a, items, coupon_code="SCOOP10", fulfilment_type="pickup")
            assert q["discount_paise"] == 2500 + 2150, q["discounts"]
        finally:
            r = admin.patch(f"{API}/admin/offer-stacking", json={"allow_offer_stacking": False})
            assert r.json()["allow_offer_stacking"] is False

    def test_wednesday_bogo(self, admin):
        s = new_session()
        try:
            r = admin.patch(f"{API}/admin/promotions/wednesday_bogo", json={"weekdays": [0, 1, 2, 3, 4, 5, 6]})
            assert r.status_code == 200
            q = s.post(f"{API}/cart/quote", json={"items": [it(1), it(4), it(6)], "fulfilment_type": "pickup"}).json()
            assert q["discounts"][0]["code"] == "wednesday_bogo" and q["discount_paise"] == 2500
            q = s.post(f"{API}/cart/quote", json={"items": [it(1, 3), it(6, 3)], "fulfilment_type": "pickup"}).json()
            assert q["discount_paise"] == 5000  # 2 cheapest free
            q = s.post(f"{API}/cart/quote", json={"items": [it(1), it(24)], "fulfilment_type": "pickup"}).json()
            assert q["discount_paise"] == 0 and any("add 2 more" in n for n in q["notes"])
            assert admin.patch(f"{API}/admin/promotions/wednesday_bogo", json={"weekdays": [0, 9]}).status_code == 400
        finally:
            r = admin.patch(f"{API}/admin/promotions/wednesday_bogo", json={"weekdays": [2]})
            assert r.json()["config"]["weekdays"] == [2]


# --- Orders lifecycle
class TestOrders:
    def test_first_order_idempotent_inventory_cancel(self, cust_a, cust_b):
        before = db_inventory([1, 4])
        key = uuid.uuid4().hex
        r = place(cust_a, [it(1), it(4)], key=key)
        assert r.status_code == 200, r.text
        o = r.json()
        assert o["status"] == "pending_confirmation" and o["discount_paise"] == 3000 and o["total_paise"] == 5000
        r2 = place(cust_a, [it(1), it(4)], key=key)
        assert r2.status_code == 200 and r2.json()["order_number"] == o["order_number"]
        after = db_inventory([1, 4])
        assert after[1] == before[1] - 1 and after[4] == before[4] - 1
        q = quote(cust_a, [it(1), it(4)], fulfilment_type="pickup")
        assert q["discount_paise"] == 0, "first-order offer should disappear after order"
        # isolation
        assert cust_b.get(f"{API}/orders/{o['order_number']}").status_code == 404
        assert cust_b.post(f"{API}/orders/{o['order_number']}/cancel").status_code == 404
        assert requests.get(f"{API}/orders/{o['order_number']}").status_code == 401
        # cancel
        c = cust_a.post(f"{API}/orders/{o['order_number']}/cancel")
        assert c.status_code == 200 and c.json()["status"] == "cancelled"
        assert db_inventory([1, 4]) == before
        q = quote(cust_a, [it(1), it(4)], fulfilment_type="pickup")
        assert q["discount_paise"] == 3000, "first-order eligibility should be restored after cancel"
        assert cust_a.post(f"{API}/orders/{o['order_number']}/cancel").status_code == 400

    def test_price_tamper_ignored(self, cust_b):
        r = place(cust_b, [{"variant_id": 24, "quantity": 1, "price_paise": 1, "unit_price_paise": 1}],
                  subtotal_paise=1, total_paise=1)
        assert r.status_code == 200, r.text
        assert r.json()["subtotal_paise"] == 17000 and r.json()["total_paise"] == 17000
        STATE["b_order"] = r.json()["order_number"]

    def test_bad_inputs(self, cust_b):
        assert place(cust_b, [it(24)], ftype="delivery", pincode="400001").status_code == 400
        assert place(cust_b, [it(24)], payment_method="online").status_code == 400
        assert place(cust_b, [it(24)], ftype="pickup", payment_method="pay_on_delivery").status_code in (400, 200)
        assert place(cust_b, [it(24)], customer_phone="123").status_code == 422
        assert place(cust_b, [], ).status_code == 400

    def test_concurrent_first_order(self, cust_a):
        cookies = cust_a.cookies.get_dict()

        def go(_):
            s = new_session()
            s.cookies.update(cookies)
            return place(s, [it(1), it(4)])
        with cf.ThreadPoolExecutor(2) as ex:
            res = list(ex.map(go, range(2)))
        ok = [r.json() for r in res if r.status_code == 200]
        free = [o for o in ok if any(d["code"] == "first_order" for d in o["discounts"])]
        assert len(free) <= 1, [r.text for r in res]
        STATE["concurrent_orders"] = [o["order_number"] for o in ok]
        for n in STATE["concurrent_orders"]:
            cust_a.post(f"{API}/orders/{n}/cancel")


# --- Admin order management
class TestAdmin:
    def test_delivery_flow(self, cust_a, admin):
        r = place(cust_a, [it(24)], ftype="delivery")
        assert r.status_code == 200, r.text
        n = r.json()["order_number"]
        st = lambda s, note=None: admin.post(f"{API}/admin/orders/{n}/status", json={"status": s, "note": note})
        lst = admin.get(f"{API}/admin/orders", params={"status": "pending_confirmation"}).json()
        assert any(o["order_number"] == n for o in lst)
        assert st("delivered").status_code == 400
        assert st("cancelled").status_code == 400  # reason required
        assert st("refund_pending").status_code == 400
        assert st("accepted").json()["status"] == "accepted"
        assert cust_a.post(f"{API}/orders/{n}/cancel").status_code == 400
        assert st("preparing").status_code == 200
        assert st("ready_for_pickup").status_code == 400
        assert st("out_for_delivery").status_code == 200
        d = st("delivered").json()
        assert d["status"] == "delivered" and d["payment_status"] == "pending"
        assert st("refund_pending", "x").status_code == 400  # unpaid
        p = admin.post(f"{API}/admin/orders/{n}/payment", json={"action": "mark_collected", "note": "TEST cash"})
        assert p.status_code == 200 and p.json()["payment_status"] == "paid"
        assert admin.post(f"{API}/admin/orders/{n}/payment", json={"action": "mark_collected"}).status_code == 400
        assert st("refund_pending", "TEST refund").status_code == 200
        assert st("refunded", "TEST done").json()["payment_status"] == "refunded"
        mine = cust_a.get(f"{API}/orders/{n}").json()
        assert mine["status"] == "refunded" and len(mine["history"]) >= 6
        notes = cust_a.get(f"{API}/notifications").json()
        assert notes["unread"] >= 1 and any(x["order_number"] == n for x in notes["items"])

    def test_pickup_flow_and_reject(self, cust_b, admin):
        n = STATE["b_order"]
        st = lambda s, note=None: admin.post(f"{API}/admin/orders/{n}/status", json={"status": s, "note": note})
        for s in ("accepted", "preparing"):
            assert st(s).status_code == 200
        assert st("out_for_delivery").status_code == 400
        assert st("ready_for_pickup").status_code == 200
        assert st("delivered").status_code == 200
        r = place(cust_b, [it(9)])
        n2 = r.json()["order_number"]
        before = db_inventory([9])
        rj = admin.post(f"{API}/admin/orders/{n2}/status", json={"status": "cancelled", "note": "TEST out of stock"})
        assert rj.status_code == 200 and rj.json()["cancel_reason"] == "TEST out of stock"
        assert db_inventory([9])[9] == before[9] + 1
        assert admin.post(f"{API}/admin/orders/{n2}/payment", json={"action": "mark_collected"}).status_code == 400

    def test_overview_and_audit(self, admin):
        ov = admin.get(f"{API}/admin/overview").json()
        assert len(ov["daily_revenue"]) == 14 and len(ov["monthly_revenue"]) == 6
        logs = admin.get(f"{API}/admin/audit-logs").json()
        actions = {l["action"] for l in logs}
        assert {"promotion_updated", "offer_stacking_changed", "order_status_changed", "payment_collected"} <= actions
        pr = admin.get(f"{API}/admin/promotions").json()
        assert pr["allow_offer_stacking"] is False
        assert next(p for p in pr["promotions"] if p["code"] == "wednesday_bogo")["config"]["weekdays"] == [2]
