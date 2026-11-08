# Helper: diff two snapshots (settings/policies/seed products) to verify restoration
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
for k in a["settings"]:
    if k != "status" and a["settings"][k] != b["settings"][k]:
        print("SETTINGS DIFF", k, a["settings"][k], "=>", b["settings"][k])
bp = {p["id"]: p for p in b["products"]}
for p in a["products"]:
    q = bp.get(p["id"])
    if not q or (p["is_active"], [(v["price_paise"], v["stock"]) for v in p["variants"]]) != (q["is_active"], [(v["price_paise"], v["stock"]) for v in q["variants"]]):
        print("PRODUCT DIFF", p["slug"])
print("new products", [(p["slug"], p["is_active"]) for p in b["products"] if p["id"] not in {x["id"] for x in a["products"]}])
print("new cats", [(c["slug"], c["is_active"]) for c in b["categories"] if c["id"] not in {x["id"] for x in a["categories"]}])
print("coupons", [(c["code"], c["is_active"]) for c in b["coupons"]])
