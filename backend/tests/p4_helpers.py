# Helper: restore logo to null (UI has no clear option) and create a reorder-test order for a TEST customer
import json, sys
sys.path.insert(0, "/app/backend/tests")
from test_icepops_api import API, BE_ENV, new_session, place, it
from test_phase4_seller_tools import settings_body

mode = sys.argv[1]
if mode == "restore_logo":
    s = new_session()
    s.post(f"{API}/auth/login", json={"email": BE_ENV["ADMIN_EMAIL"], "password": BE_ENV["ADMIN_PASSWORD"]})
    st = s.get(f"{API}/admin/settings").json()
    r = s.put(f"{API}/admin/settings", json=settings_body(st, logo_url=None, closure_message=None))
    print("logo restore", r.status_code, r.json()["logo_url"])
elif mode == "order":
    email = sys.argv[2]
    s = new_session()
    print("login", s.post(f"{API}/auth/login", json={"email": email, "password": "Test@12345"}).status_code)
    r = place(s, [it(7, 2), it(4, 1)])
    print("order", r.status_code, r.json().get("order_number"), r.json().get("total_paise"), r.text[:200] if r.status_code != 200 else "")
elif mode == "cancel":
    s = new_session()
    s.post(f"{API}/auth/login", json={"email": sys.argv[2], "password": "Test@12345"})
    print("cancel", s.post(f"{API}/orders/{sys.argv[3]}/cancel").status_code)
    print("cart clear", s.put(f"{API}/cart", json={"items": []}).status_code)
