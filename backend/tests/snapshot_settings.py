# Helper: snapshot admin settings + products baseline to /tmp for restore verification (read-only)
import json, sys
sys.path.insert(0, "/app/backend/tests")
from test_icepops_api import API, BE_ENV, new_session

s = new_session()
r = s.post(f"{API}/auth/login", json={"email": BE_ENV["ADMIN_EMAIL"], "password": BE_ENV["ADMIN_PASSWORD"]})
print("login", r.status_code)
st = s.get(f"{API}/admin/settings").json()
pr = s.get(f"{API}/admin/products").json()
cats = s.get(f"{API}/admin/categories").json()
coupons = s.get(f"{API}/admin/coupons").json()
out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/baseline.json"
json.dump({"settings": st, "products": pr, "categories": cats, "coupons": coupons}, open(out, "w"), indent=1, default=str)
print({k: st[k] for k in ("business_name", "phone", "logo_url", "is_temporarily_closed", "pickup_enabled", "delivery_enabled",
                          "default_delivery_fee_paise", "min_delivery_order_paise", "map_embed_url", "testimonials", "payment_methods")})
print("hours", st["hours"])
print("zones", st["zones"])
print("holidays", st["holidays"])
print("policies", [(p["slug"], len(p["content"])) for p in st["policies"]])
print("products", [(p["id"], p["slug"], p["is_active"], [(v["id"], v["price_paise"], v["stock"]) for v in p["variants"]]) for p in pr])
print("cats", [(c["id"], c["slug"], c["is_active"]) for c in cats])
print("coupons", [(c["code"], c["is_active"]) for c in coupons])
