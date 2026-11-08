from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import ADMIN_EMAIL, ADMIN_PASSWORD
from core.models import (
    BusinessSettings, Category, Coupon, DeliveryZone, Inventory, OpeningHour, PolicyPage, Product,
    ProductVariant, Promotion, Role, User, UserRole,
)
from core.security import hash_password

CATEGORIES = [
    ("Cream Popsicles", "cream-popsicles", "Rich, milk-based popsicles churned with real fruit and nuts.", True, "/images/cream-1.jpg"),
    ("Water Popsicles", "water-popsicles", "Light, refreshing fruit ice pops — perfect for hot afternoons.", True, "/images/water-3.jpg"),
    ("Cups & Cones", "cups-cones", "Classic scoops served in crunchy waffle cones or cups.", False, "/images/cone-1.jpg"),
    ("Scoops", "scoops", "Single and double scoops of our house-made ice creams.", False, "/images/scoop-1.jpg"),
    ("Shakes", "shakes", "Thick, creamy shakes blended to order.", False, "/images/shake-1.jpg"),
    ("Sundaes & Desserts", "sundaes-desserts", "Indulgent sundaes layered with sauces and toppings.", False, "/images/sundae-1.jpg"),
]

MILK, NUTS, GLUTEN, SOY = "Milk", "Nuts", "Gluten", "Soy"
# (category_slug, name, description, image, ingredients, allergens, featured, bestseller, [(variant, price ₹)])
PRODUCTS = [
    ("cream-popsicles", "Raspberry Ripple Pop", "Creamy vanilla pop rippled with tangy raspberry.", "/images/cream-1.jpg",
     "Milk, cream, sugar, raspberry, vanilla", [MILK], True, True, [("Regular", 50)]),
    ("cream-popsicles", "Choco Almond Crunch", "Belgian-style chocolate coating with roasted almond bits.", "/images/cream-2.jpg",
     "Milk, cream, sugar, cocoa, almonds", [MILK, NUTS, SOY], True, True, [("Regular", 60)]),
    ("cream-popsicles", "Cherry Kulfi Pop", "Slow-cooked kulfi with cherry swirls and a hint of cardamom.", "/images/cream-3.jpg",
     "Milk, sugar, cherry, cardamom", [MILK], False, False, [("Regular", 45)]),
    ("water-popsicles", "Orange Stick Ice", "Classic tangy orange ice pop — the everyday favourite.", "/images/water-6.jpg",
     "Water, sugar, orange flavour", [], False, True, [("Regular", 20)]),
    ("water-popsicles", "Mango Stick Ice", "Sweet mango ice pop at a pocket-friendly price.", "/images/water-4.jpg",
     "Water, sugar, mango pulp", [], False, True, [("Regular", 20)]),
    ("water-popsicles", "Lemon Mint Ice", "Cooling lemon and mint ice pop for hot afternoons.", "/images/water-7.jpg",
     "Water, sugar, lemon juice, mint", [], False, False, [("Regular", 20)]),
    ("water-popsicles", "Rainbow Stick Ice", "Bright three-colour fruity ice pop kids love.", "/images/water-5.jpg",
     "Water, sugar, mixed fruit flavours", [], False, False, [("Regular", 20)]),
    ("water-popsicles", "Kala Khatta Ice", "Tangy jamun ice pop with a pinch of black salt.", "/images/water-1.jpg",
     "Water, jamun, sugar, black salt", [], True, False, [("Regular", 30)]),
    ("water-popsicles", "Mango Chilli Ice", "Alphonso mango ice with a gentle chilli kick.", "/images/water-2.jpg",
     "Water, mango pulp, sugar, chilli", [], False, True, [("Regular", 35)]),
    ("water-popsicles", "Rainbow Fruit Ice", "Layers of orange, lime and strawberry fruit ice.", "/images/water-3.jpg",
     "Water, sugar, orange, lime, strawberry", [], False, False, [("Regular", 25)]),
    ("cups-cones", "Strawberry Cheesecake Cone", "Strawberry cheesecake ice cream in a waffle cone.", "/images/cone-3.jpg",
     "Milk, cream, strawberry, cream cheese, waffle cone", [MILK, GLUTEN], True, False, [("Single", 70), ("Double", 110)]),
    ("cups-cones", "Mint Choc Chip Cup", "Cool mint ice cream with dark chocolate chips.", "/images/cone-2.jpg",
     "Milk, cream, mint, chocolate", [MILK, SOY], False, False, [("Small cup", 60), ("Large cup", 95)]),
    ("cups-cones", "Double Chocolate Cone", "Two scoops of chocolate and strawberry in a crisp cone.", "/images/cone-1.jpg",
     "Milk, cream, cocoa, strawberry, waffle cone", [MILK, GLUTEN, SOY], False, True, [("Single", 75), ("Double", 120)]),
    ("scoops", "Belgian Chocolate Scoop", "Deep, dark and silky chocolate ice cream.", "/images/scoop-1.jpg",
     "Milk, cream, cocoa, sugar", [MILK, SOY], False, True, [("Single scoop", 70), ("Double scoop", 130)]),
    ("scoops", "Vanilla Bean Scoop", "Classic vanilla speckled with real vanilla bean.", "/images/scoop-2.jpg",
     "Milk, cream, sugar, vanilla bean", [MILK], False, False, [("Single scoop", 60), ("Double scoop", 110)]),
    ("scoops", "Tender Coconut Scoop", "Fresh tender coconut ice cream with coconut flakes.", "/images/scoop-3.jpg",
     "Milk, cream, tender coconut, sugar", [MILK], True, False, [("Single scoop", 80), ("Double scoop", 150)]),
    ("shakes", "Cookies & Cream Shake", "Thick vanilla shake blended with chocolate cookies.", "/images/shake-1.jpg",
     "Milk, ice cream, chocolate cookies, cream", [MILK, GLUTEN, SOY], True, True, [("Regular", 120), ("Large", 150)]),
    ("shakes", "Chocolate Fudge Shake", "Chocolate ice cream shake with fudge drizzle.", "/images/shake-2.jpg",
     "Milk, ice cream, cocoa, fudge", [MILK, SOY], False, False, [("Regular", 130), ("Large", 150)]),
    ("shakes", "Bubblegum Party Shake", "Fun blue bubblegum shake topped with sprinkles.", "/images/shake-3.jpg",
     "Milk, ice cream, bubblegum flavour, sprinkles", [MILK], False, False, [("Regular", 140)]),
    ("sundaes-desserts", "Berry Swirl Sundae", "Vanilla scoops with mixed berry compote.", "/images/sundae-1.jpg",
     "Milk, cream, mixed berries, sugar", [MILK], True, False, [("Regular", 140)]),
    ("sundaes-desserts", "Strawberry Parfait", "Layers of ice cream, fresh strawberries and berry sauce.", "/images/sundae-2.jpg",
     "Milk, cream, strawberries, sugar", [MILK], False, True, [("Regular", 150)]),
    ("sundaes-desserts", "Classic Banana Split", "Three scoops, banana, whipped cream and chocolate sauce.", "/images/sundae-3.jpg",
     "Milk, cream, banana, cocoa, nuts", [MILK, NUTS], False, False, [("Regular", 150)]),
    ("sundaes-desserts", "Sprinkle Party Bowl", "Vanilla scoops in a sprinkle-crusted edible bowl.", "/images/sundae-4.jpg",
     "Milk, cream, sugar, sprinkles, wafer", [MILK, GLUTEN], False, False, [("Regular", 130)]),
]

POLICIES = {
    "privacy-policy": ("Privacy Policy", "We collect your name, email, mobile number and delivery address only to process and deliver your orders.\n\nWe never store card numbers, CVV, UPI PINs or banking passwords. Online payments (when enabled) are processed by our payment partner.\n\n[Owner to review and complete with legal advice: data retention period, grievance officer name and contact.]"),
    "terms": ("Terms & Conditions", "By placing an order with ICEPOPS you agree to these terms.\n\nPrices are in Indian Rupees (₹) and include applicable taxes unless stated otherwise.\n\n[Owner to review and complete with legal advice.]"),
    "cancellation-policy": ("Cancellation Policy", "You can cancel your order from the order page while it is still 'Pending confirmation'. Once the shop accepts it, please contact us to request a cancellation.\n\n[Owner to confirm cancellation rules.]"),
    "refund-policy": ("Refund Policy", "If a prepaid order is cancelled or cannot be fulfilled, the refund is initiated to the original payment method.\n\n[Owner to confirm refund timelines.]"),
    "delivery-policy": ("Delivery Policy", "We deliver only to the PIN codes listed at checkout. Frozen desserts are packed to travel well, but please store them in the freezer on arrival.\n\n[Owner to confirm delivery radius, times and charges.]"),
    "allergens": ("Allergens & Ingredients", "Each product lists its ingredients and allergens on the menu. Our kitchen handles milk, nuts, gluten and soy, so traces may be present in any product.\n\n[Owner to verify all ingredient and allergen details.]"),
    "food-safety": ("Food Safety & FSSAI", "FSSAI licence / registration number: [FSSAI number — to be supplied by owner]\n\nFood business operator: [Legal business name — to be supplied by owner]\n\n[Owner to add hygiene and storage practices.]"),
}

PAYMENT_METHODS = [
    {"code": "pay_on_delivery", "label": "Pay on delivery (cash / UPI to rider)", "enabled": True},
    {"code": "pay_at_pickup", "label": "Pay at the counter on pickup", "enabled": True},
    {"code": "online", "label": "Pay online — UPI, card, netbanking", "enabled": True},
]


async def seed(db: AsyncSession) -> None:
    roles = {r.name: r for r in (await db.execute(select(Role))).scalars()}
    for name in ("admin", "customer"):
        if name not in roles:
            roles[name] = Role(name=name)
            db.add(roles[name])
    await db.flush()

    admin = (await db.execute(select(User).where(User.email == ADMIN_EMAIL))).scalar_one_or_none()
    if not admin:
        db.add(User(name="ICEPOPS Owner", email=ADMIN_EMAIL, password_hash=hash_password(ADMIN_PASSWORD),
                    roles=[roles["admin"], roles["customer"]]))
    elif "admin" not in admin.role_names:
        db.add(UserRole(user_id=admin.id, role_id=roles["admin"].id))

    existing_settings = await db.get(BusinessSettings, 1)
    if existing_settings and any("coming soon" in (m.get("label") or "") for m in existing_settings.payment_methods or []):
        existing_settings.payment_methods = [
            {**m, "label": "Pay online — UPI, card, netbanking", "enabled": True} if m.get("code") == "online" else m
            for m in existing_settings.payment_methods]
    if not existing_settings:
        db.add(BusinessSettings(
            id=1, business_name="ICEPOPS", tagline="Handcrafted pops & scoops, made fresh every day",
            phone="[Shop phone number]", whatsapp="[WhatsApp number]", email=ADMIN_EMAIL,
            address_line="Opposite to bus stop, near junction", city="Gajapathinagaram", state="Andhra Pradesh", pincode="535270",
            map_embed_url=None, fssai_number="[FSSAI licence number — to be supplied]",
            default_delivery_fee_paise=3000, min_delivery_order_paise=0, allow_offer_stacking=False,
            payment_methods=PAYMENT_METHODS, testimonials=[]))
        for wd in range(7):
            db.add(OpeningHour(weekday=wd, open_time=time(11, 0), close_time=time(22, 30)))
        for i, pin in enumerate(["500001", "500002", "500003"], 1):
            db.add(DeliveryZone(name=f"Sample zone {i} (replace)", pincode=pin, delivery_fee_paise=3000))
        for slug, (title, content) in POLICIES.items():
            db.add(PolicyPage(slug=slug, title=title, content=content))
        db.add(Coupon(code="SCOOP10", description="10% off on orders of ₹200+ (max ₹50) — sample coupon",
                      discount_type="percent", discount_value=10, min_order_paise=20000, max_discount_paise=5000,
                      per_user_limit=1, usage_limit=500))

    existing_promos = set((await db.execute(select(Promotion.code))).scalars())
    for code, name, desc, cfg in [
        ("wednesday_bogo", "Wednesday Popsicle Party", "Every Wednesday: buy 2 popsicles, get 1 free. The cheapest eligible popsicle is free.",
         {"weekdays": [2], "buy": 2, "free": 1}),
        ("first_order", "First-Order Welcome", "New here? Get one popsicle free on your first order above ₹50.",
         {"min_order_paise": 5000}),
        ("free_delivery", "Free Delivery", "Free delivery on orders of ₹100 or more (after discounts).",
         {"threshold_paise": 10000}),
        ("family_pack", "Popsicle Family Pack", "Any 5 water popsicles for just ₹90 — mix your favourite flavours.",
         {"pack_size": 5, "pack_price_paise": 9000, "category_slugs": ["water-popsicles"]}),
        ("loyalty", "Stamp Card", "Get a stamp for every delivered order. Collect 10 stamps and your next water popsicle is free.",
         {"stamps_needed": 10, "product_ids": [], "category_slugs": ["water-popsicles"], "max_value_paise": 2000}),
    ]:
        if code not in existing_promos:
            db.add(Promotion(code=code, name=name, description=desc, is_enabled=True, config=cfg))

    if not (await db.execute(select(Category.id).limit(1))).first():
        cats = {}
        for i, (name, slug, desc, popsicle, img) in enumerate(CATEGORIES):
            cats[slug] = Category(name=name, slug=slug, description=desc, is_popsicle=popsicle, image_url=img, sort_order=i)
            db.add(cats[slug])
        await db.flush()
        for i, (cslug, name, desc, img, ingr, allergens, featured, best, variants) in enumerate(PRODUCTS):
            slug = name.lower().replace("&", "and").replace(" ", "-")
            p = Product(category_id=cats[cslug].id, name=name, slug=slug, description=desc, image_url=img,
                        ingredients=ingr, allergens=allergens, is_featured=featured, is_bestseller=best, sort_order=i)
            db.add(p)
            await db.flush()
            for j, (vname, price) in enumerate(variants):
                v = ProductVariant(product_id=p.id, name=vname, price_paise=price * 100,
                                   sku=f"{slug[:40]}-{vname.lower().replace(' ', '-')}", sort_order=j)
                db.add(v)
                await db.flush()
                db.add(Inventory(variant_id=v.id, quantity=100, low_stock_threshold=10))
    await db.commit()
