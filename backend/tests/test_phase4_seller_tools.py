# ICEPOPS Phase 4 regression: uploads, categories, products, coupons, settings/hours/holidays/zones/policies,
# testimonials, logo, audit log, reorder data, admin security. Run serially: pytest tests/test_phase4_seller_tools.py -n 0 -v
# Restores all settings/hours/zones/policies to the snapshot taken at start; TEST_ data is deactivated/deleted.
import base64
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

from test_icepops_api import API, BE_ENV, H, IST, new_session, register, phone, place, quote, it, pref_time

RUN = uuid.uuid4().hex[:6].upper()
STATE = {}
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
ADMIN_PATHS_GET = ["products", "categories", "coupons", "settings", "audit-logs"]
ADMIN_UNSAFE = [("post", "products"), ("post", "categories"), ("post", "coupons"), ("put", "settings"),
                ("put", "hours"), ("post", "holidays"), ("post", "zones"), ("put", "policies/terms")]


@pytest.fixture(scope="module")
def admin():
    s = new_session()
    r = s.post(f"{API}/auth/login", json={"email": BE_ENV["ADMIN_EMAIL"], "password": BE_ENV["ADMIN_PASSWORD"]})
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return s


def settings_body(st, **over):
    keys = ("business_name", "tagline", "logo_url", "phone", "whatsapp", "email", "address_line", "city", "state",
            "pincode", "map_embed_url", "fssai_number", "gstin", "is_temporarily_closed", "closure_message",
            "pickup_enabled", "delivery_enabled", "default_delivery_fee_paise", "min_delivery_order_paise")
    b = {k: st[k] for k in keys}
    b["payment_methods"] = [{"code": m["code"], "enabled": m["enabled"]} for m in st["payment_methods"]]
    b["testimonials"] = st["testimonials"]
    b.update(over)
    return b


@pytest.fixture(scope="module", autouse=True)
def baseline(admin):
    st = admin.get(f"{API}/admin/settings").json()
    STATE["base"] = st
    yield st
    # ---- restore everything
    admin.put(f"{API}/admin/settings", json=settings_body(st))
    admin.put(f"{API}/admin/hours", json=[{"weekday": h["weekday"], "open": h["open"], "close": h["close"], "is_closed": h["is_closed"]} for h in st["hours"]])
    for p in st["policies"]:
        admin.put(f"{API}/admin/policies/{p['slug']}", json={"title": p["title"], "content": p["content"]})
    cur = admin.get(f"{API}/admin/settings").json()
    base_zone_ids = {z["id"] for z in st["zones"]}
    for z in cur["zones"]:
        if z["id"] not in base_zone_ids and z["id"] in STATE.get("zone_ids", []):
            admin.delete(f"{API}/admin/zones/{z['id']}")
    for z in st["zones"]:
        admin.put(f"{API}/admin/zones/{z['id']}", json={k: z[k] for k in ("name", "pincode", "delivery_fee_paise", "is_active")})
    for hid in STATE.get("holiday_ids", []):
        admin.delete(f"{API}/admin/holidays/{hid}")


@pytest.fixture(scope="module")
def cust():
    s, u = register(f"TEST_P4_{RUN}", f"test_p4_{RUN.lower()}@example.com", phone())
    return s


# --- Security
class TestSecurity:
    def test_anon_401(self):
        for p in ADMIN_PATHS_GET:
            assert requests.get(f"{API}/admin/{p}").status_code == 401, p
        r = requests.post(f"{API}/admin/uploads", headers={"X-CSRF-Guard": "1"}, files={"file": ("a.png", PNG, "image/png")})
        assert r.status_code == 401

    def test_customer_403(self, cust):
        for p in ADMIN_PATHS_GET:
            assert cust.get(f"{API}/admin/{p}").status_code == 403, p
        for m, p in ADMIN_UNSAFE:
            assert getattr(cust, m)(f"{API}/admin/{p}", json={}).status_code == 403, p
        r = requests.post(f"{API}/admin/uploads", headers={"X-CSRF-Guard": "1"}, cookies=cust.cookies,
                          files={"file": ("a.png", PNG, "image/png")})
        assert r.status_code == 403

    def test_csrf_required(self, admin):
        r = requests.post(f"{API}/admin/categories", cookies=admin.cookies, json={"name": "TEST_x"})
        assert r.status_code == 403


# --- Upload
class TestUpload:
    def test_upload_and_serve(self, admin):
        r = requests.post(f"{API}/admin/uploads", headers={"X-CSRF-Guard": "1"}, cookies=admin.cookies,
                          files={"file": ("TEST_a.png", PNG, "image/png")})
        assert r.status_code == 200, r.text
        url = r.json()["url"]
        assert url.startswith("/api/files/")
        STATE["img"] = url
        g = requests.get(f"{API.rsplit('/api', 1)[0]}{url}")
        assert g.status_code == 200 and g.content == PNG and g.headers["content-type"].startswith("image/png")

    def test_upload_non_image(self, admin):
        r = requests.post(f"{API}/admin/uploads", headers={"X-CSRF-Guard": "1"}, cookies=admin.cookies,
                          files={"file": ("x.png", b"not an image at all", "image/png")})
        assert r.status_code == 400
        r = requests.post(f"{API}/admin/uploads", headers={"X-CSRF-Guard": "1"}, cookies=admin.cookies,
                          files={"file": ("x.txt", b"hello", "text/plain")})
        assert r.status_code == 400

    def test_unknown_file_404(self):
        assert requests.get(f"{API}/files/icepops/products/nope.png").status_code == 404


# --- Catalog management
class TestCatalog:
    def test_category_create_edit(self, admin):
        r = admin.post(f"{API}/admin/categories", json={"name": f"TEST_Cat {RUN}", "is_popsicle": True, "sort_order": 900})
        assert r.status_code == 200, r.text
        c = r.json()
        STATE["cat"] = c
        assert c["is_popsicle"] is True and c["slug"].startswith("test-cat")
        pub = requests.get(f"{API}/catalog/categories").json()
        assert any(x["id"] == c["id"] and x["is_popsicle"] for x in pub)
        r = admin.put(f"{API}/admin/categories/{c['id']}", json={"name": f"TEST_Cat {RUN} edited", "is_popsicle": False,
                                                                 "sort_order": 900, "is_active": True})
        assert r.status_code == 200 and r.json()["name"].endswith("edited") and r.json()["is_popsicle"] is False

    def test_product_create_public(self, admin):
        body = {"name": f"TEST_Pop {RUN}", "category_id": STATE["cat"]["id"], "description": "test", "image_url": STATE["img"],
                "allergens": ["Milk", " "], "variants": [{"name": "Regular", "price_paise": 4900, "stock": 20},
                                                         {"name": "Large", "price_paise": 7900, "stock": 5}]}
        r = admin.post(f"{API}/admin/products", json=body)
        assert r.status_code == 200, r.text
        p = r.json()
        STATE["prod"] = p
        assert p["allergens"] == ["Milk"] and [v["stock"] for v in p["variants"]] == [20, 5]
        pub = requests.get(f"{API}/catalog/products/{p['slug']}").json()
        assert pub["image_url"] == STATE["img"] and pub["variants"][0]["price_paise"] == 4900 and pub["in_stock"]

    def test_product_bad_image_url(self, admin):
        r = admin.post(f"{API}/admin/products", json={"name": "TEST_bad", "category_id": STATE["cat"]["id"],
                                                      "image_url": "javascript:alert(1)", "variants": [{"name": "R", "price_paise": 1, "stock": 1}]})
        assert r.status_code in (400, 422)

    def _put(self, admin, **over):
        p = STATE["prod"]
        body = {k: p[k] for k in ("name", "category_id", "description", "image_url", "ingredients", "allergens", "is_featured",
                                  "is_bestseller", "promo_eligible", "is_active", "sort_order")}
        body["variants"] = [{k: v[k] for k in ("id", "name", "price_paise", "is_active", "stock", "track_stock", "low_stock_threshold")}
                            for v in p["variants"]]
        body.update(over)
        r = admin.put(f"{API}/admin/products/{p['id']}", json=body)
        assert r.status_code == 200, r.text
        STATE["prod"] = r.json()
        return r.json()

    def test_edit_price_stock(self, admin):
        vs = [dict(v) for v in STATE["prod"]["variants"]]
        vs[0].update(price_paise=5500, stock=0)
        self._put(admin, variants=vs)
        pub = requests.get(f"{API}/catalog/products/{STATE['prod']['slug']}").json()
        assert pub["variants"][0]["price_paise"] == 5500 and pub["variants"][0]["in_stock"] is False
        assert pub["in_stock"] is True  # Large still has stock
        vs[0].update(stock=10)
        self._put(admin, variants=vs)

    def test_hide_product(self, admin):
        self._put(admin, is_active=False)
        assert requests.get(f"{API}/catalog/products/{STATE['prod']['slug']}").status_code == 404
        self._put(admin, is_active=True)
        assert requests.get(f"{API}/catalog/products/{STATE['prod']['slug']}").status_code == 200

    def test_delete_product_without_orders(self, admin):
        r = admin.post(f"{API}/admin/products", json={"name": f"TEST_Del {RUN}", "category_id": STATE["cat"]["id"],
                                                      "variants": [{"name": "R", "price_paise": 100, "stock": 1}]})
        pid = r.json()["id"]
        assert admin.delete(f"{API}/admin/products/{pid}").status_code == 200
        assert all(p["id"] != pid for p in admin.get(f"{API}/admin/products").json())


# --- Coupons
class TestCoupons:
    def _body(self, **over):
        b = {"code": f"TEST{RUN}", "discount_type": "percent", "discount_value": 20, "min_order_paise": 0,
             "max_discount_paise": 100000, "per_user_limit": 1, "usage_limit": 5, "is_active": True,
             "category_ids": [STATE["cat"]["id"]], "product_ids": []}
        b.update(over)
        return b

    def test_create_and_dup(self, admin):
        r = admin.post(f"{API}/admin/coupons", json=self._body(code=f"test{RUN}"))
        assert r.status_code == 200, r.text
        c = r.json()
        STATE["coupon"] = c
        assert c["code"] == f"TEST{RUN}" and c["category_ids"] == [STATE["cat"]["id"]] and c["used_count"] == 0
        assert admin.post(f"{API}/admin/coupons", json=self._body()).status_code == 409
        assert admin.post(f"{API}/admin/coupons", json=self._body(code=f"TESTP{RUN}", discount_value=150)).status_code == 400

    def test_restricted_discount(self, cust):
        v = STATE["prod"]["variants"][0]["id"]
        # variant 7 = non-popsicle cone (₹70) so first-order popsicle promo doesn't compete; only TEST items discounted
        q = quote(cust, [it(v, 2), it(7, 1)], fulfilment_type="pickup", coupon_code=f"TEST{RUN}")
        assert not q.get("coupon_error"), q
        cd = [d for d in q["discounts"] if d["kind"] == "coupon"]
        assert cd and cd[0]["code"] == f"TEST{RUN}" and cd[0]["amount_paise"] == 2 * 5500 * 20 // 100, q
        q2 = quote(cust, [it(1, 1)], fulfilment_type="pickup", coupon_code=f"TEST{RUN}")
        assert q2.get("coupon_error"), q2

    def test_inactive_expired(self, admin, cust):
        v = STATE["prod"]["variants"][0]["id"]
        cid = STATE["coupon"]["id"]
        assert admin.put(f"{API}/admin/coupons/{cid}", json=self._body(is_active=False)).status_code == 200
        assert "not valid" in quote(cust, [it(v)], fulfilment_type="pickup", coupon_code=f"TEST{RUN}")["coupon_error"]
        past = datetime.now(IST) - timedelta(days=2)
        r = admin.put(f"{API}/admin/coupons/{cid}", json=self._body(starts_at=past.isoformat(), ends_at=(past + timedelta(days=1)).isoformat()))
        assert r.status_code == 200, r.text
        assert "expired" in quote(cust, [it(v)], fulfilment_type="pickup", coupon_code=f"TEST{RUN}")["coupon_error"]
        bad = admin.put(f"{API}/admin/coupons/{cid}", json=self._body(starts_at=past.isoformat(), ends_at=past.isoformat()))
        assert bad.status_code == 400
        assert admin.put(f"{API}/admin/coupons/{cid}", json=self._body()).status_code == 200

    def test_order_with_coupon_redemption(self, admin, cust):
        v = STATE["prod"]["variants"][0]["id"]
        r = place(cust, [it(v, 2)], coupon_code=f"TEST{RUN}")
        assert r.status_code == 200, r.text
        o = r.json()
        STATE["order"] = o
        assert o["coupon_code"] == f"TEST{RUN}"
        assert all("variant_id" in i for i in o["items"]) and o["items"][0]["variant_id"] == v
        reds = admin.get(f"{API}/admin/coupons/{STATE['coupon']['id']}/redemptions").json()
        assert reds and reds[0]["order_number"] == o["order_number"]
        c = [x for x in admin.get(f"{API}/admin/coupons").json() if x["id"] == STATE["coupon"]["id"]][0]
        assert c["used_count"] == 1

    def test_reorder_data_in_orders_list(self, cust):
        lst = cust.get(f"{API}/orders").json()
        mine = [o for o in lst if o["order_number"] == STATE["order"]["order_number"]][0]
        assert mine["items"][0]["variant_id"] == STATE["prod"]["variants"][0]["id"] and mine["items"][0]["quantity"] == 2

    def test_delete_product_with_orders_409(self, admin):
        r = admin.delete(f"{API}/admin/products/{STATE['prod']['id']}")
        assert r.status_code == 409 and "Deactivate it instead" in r.json()["detail"]

    def test_cancel_order(self, cust):
        r = cust.post(f"{API}/orders/{STATE['order']['order_number']}/cancel")
        assert r.status_code == 200


# --- Settings
class TestSettings:
    def test_map_validation(self, admin):
        r = admin.put(f"{API}/admin/settings", json=settings_body(STATE["base"], map_embed_url="https://evil.com/x"))
        STATE["map_status"] = r.status_code
        assert r.status_code in (400, 422)

    def test_online_stays_disabled(self, admin):
        b = settings_body(STATE["base"])
        b["payment_methods"] = [{"code": m["code"], "enabled": True} for m in STATE["base"]["payment_methods"]]
        st = admin.put(f"{API}/admin/settings", json=b).json()
        assert [m for m in st["payment_methods"] if m["code"] == "online"][0]["enabled"] is False

    def test_temporarily_closed_blocks_checkout(self, admin, cust):
        msg = f"TEST_closed {RUN}"
        st = admin.put(f"{API}/admin/settings", json=settings_body(STATE["base"], is_temporarily_closed=True, closure_message=msg))
        assert st.status_code == 200
        try:
            assert requests.get(f"{API}/store/info").json()["status"]["reason"] == msg
            r = place(cust, [it(1)])
            assert r.status_code == 400 and msg in r.json()["detail"], r.text
        finally:
            admin.put(f"{API}/admin/settings", json=settings_body(STATE["base"]))
        assert requests.get(f"{API}/store/info").json()["status"]["reason"] != msg

    def test_testimonials_and_logo(self, admin):
        st = admin.put(f"{API}/admin/settings", json=settings_body(STATE["base"], logo_url=STATE["img"],
                                                                   testimonials=[{"name": "TEST_Ravi", "text": "Great pops!"}]))
        assert st.status_code == 200, st.text
        info = requests.get(f"{API}/store/info").json()
        assert info["logo_url"] == STATE["img"] and info["testimonials"][0]["name"] == "TEST_Ravi"
        bad = admin.put(f"{API}/admin/settings", json=settings_body(STATE["base"], logo_url="https://evil.com/a.png"))
        assert bad.status_code in (400, 422)
        admin.put(f"{API}/admin/settings", json=settings_body(STATE["base"]))
        info = requests.get(f"{API}/store/info").json()
        assert info["logo_url"] is None and info["testimonials"] == []

    def test_hours(self, admin):
        hrs = [{"weekday": h["weekday"], "open": h["open"], "close": h["close"], "is_closed": h["is_closed"]} for h in STATE["base"]["hours"]]
        bad = [dict(h) for h in hrs]
        bad[0].update(open="12:00", close="11:00")
        assert admin.put(f"{API}/admin/hours", json=bad).status_code == 400
        assert admin.put(f"{API}/admin/hours", json=hrs[:6]).status_code == 400
        mod = [dict(h) for h in hrs]
        mod[6].update(is_closed=True)
        st = admin.put(f"{API}/admin/hours", json=mod).json()
        assert st["hours"][6]["is_closed"] is True
        st = admin.put(f"{API}/admin/hours", json=hrs).json()
        assert st["hours"][6]["is_closed"] is False

    def test_holidays(self, admin):
        d = (datetime.now(IST) + timedelta(days=200)).date().isoformat()
        st = admin.post(f"{API}/admin/holidays", json={"date": d, "reason": "TEST_holiday"}).json()
        h = [x for x in st["holidays"] if x["date"] == d][0]
        STATE.setdefault("holiday_ids", []).append(h["id"])
        assert admin.post(f"{API}/admin/holidays", json={"date": d, "reason": "TEST_holiday"}).status_code == 409
        st = admin.delete(f"{API}/admin/holidays/{h['id']}").json()
        assert all(x["id"] != h["id"] for x in st["holidays"])

    def test_zones(self, admin, cust):
        pin = "56" + str(uuid.uuid4().int)[:4]
        assert admin.post(f"{API}/admin/zones", json={"name": "TEST_zone", "pincode": "12345"}).status_code in (400, 422)
        st = admin.post(f"{API}/admin/zones", json={"name": "TEST_zone", "pincode": pin, "delivery_fee_paise": 2000})
        assert st.status_code == 200, st.text
        z = [x for x in st.json()["zones"] if x["pincode"] == pin][0]
        STATE.setdefault("zone_ids", []).append(z["id"])
        assert admin.post(f"{API}/admin/zones", json={"name": "TEST_zone", "pincode": pin}).status_code == 409
        q = quote(cust, [it(1, 2)], fulfilment_type="delivery", pincode=pin)
        assert not q["errors"] and q["delivery_fee_paise"] in (2000, 0), q
        admin.put(f"{API}/admin/zones/{z['id']}", json={"name": "TEST_zone", "pincode": pin, "delivery_fee_paise": 2000, "is_active": False})
        q = quote(cust, [it(1, 2)], fulfilment_type="delivery", pincode=pin)
        assert any(pin in e for e in q["errors"]), q
        st = admin.delete(f"{API}/admin/zones/{z['id']}").json()
        assert all(x["pincode"] != pin for x in st["zones"])

    def test_policy_edit(self, admin):
        p = [x for x in STATE["base"]["policies"] if x["slug"] == "terms"][0]
        new = f"TEST_terms content {RUN} for testing only."
        assert admin.put(f"{API}/admin/policies/terms", json={"title": p["title"], "content": new}).status_code == 200
        assert requests.get(f"{API}/policies/terms").json()["content"] == new
        admin.put(f"{API}/admin/policies/terms", json={"title": p["title"], "content": p["content"]})
        assert requests.get(f"{API}/policies/terms").json()["content"] == p["content"]

    def test_audit_log(self, admin):
        logs = admin.get(f"{API}/admin/audit-logs").json()
        logs = logs.get("items", logs) if isinstance(logs, dict) else logs
        actions = {l["action"] for l in logs}
        for a in ("product_created", "product_updated", "coupon_created", "settings_updated", "zone_added", "hours_updated", "policy_updated"):
            assert a in actions, (a, actions)


# --- Cleanup of TEST_ catalog data (runs last)
class TestZCleanup:
    def test_deactivate_test_data(self, admin):
        c = STATE["coupon"]
        b = {k: c[k] for k in ("code", "description", "discount_type", "discount_value", "min_order_paise", "max_discount_paise",
                               "usage_limit", "per_user_limit", "new_customers_only", "product_ids", "category_ids")}
        assert admin.put(f"{API}/admin/coupons/{c['id']}", json={**b, "is_active": False}).status_code == 200
        TestCatalog()._put(admin, is_active=False)
        cat = STATE["cat"]
        assert admin.put(f"{API}/admin/categories/{cat['id']}", json={"name": f"TEST_Cat {RUN} edited", "is_popsicle": False,
                                                                     "sort_order": 900, "is_active": False}).status_code == 200
