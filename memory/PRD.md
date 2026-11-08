# ICEPOPS – PRD

## Original problem statement
Complete Ice Cream Parlour E-Commerce and Business Management Web Application for a small local ice cream business in India (brand: ICEPOPS). Customer shop (home, menu, cart, checkout, order tracking, auth incl. Google, addresses), secure seller/admin dashboard (orders, products, variants, inventory, coupons, settings, reports, audit logs), promotion engine (Wednesday Buy-2-Get-1 popsicles, first-order free popsicle above ₹50, free delivery ≥ ₹100, configurable, no stacking by default), PostgreSQL normalized DB with transactions, Razorpay-ready payment service (no live payments yet, no fake success), in-app notifications with email/WhatsApp integration points, strong security, legal/FSSAI pages with placeholders, INR / Indian phone / Asia/Kolkata. Work phase-by-phase.

## User choices
- Own PostgreSQL (Neon) via DATABASE_URL secret; ADMIN_EMAIL / ADMIN_PASSWORD secrets
- Emergent Google Sign-In + email/password; Emergent managed email (Resend); Emergent storage (Phase 4)
- Shop + backend built together

## Architecture
React (CRA, Tailwind, shadcn) → FastAPI `/api` → PostgreSQL (SQLAlchemy 2 async + asyncpg). Tables auto-created at startup + idempotent seed (core/seed.py). Money in paise. Cookie sessions (hashed tokens, HttpOnly/Secure/Lax) + X-CSRF-Guard header on unsafe methods. Pricing engine core/pricing.py; orders in a single transaction with row locks (user, inventory, coupon) + idempotency key + unique once_key for first-order offer. PaymentService (offline now, Razorpay later). Notifications: in-app + email outbox; WhatsApp recorded as not_connected.

## Implemented (2026-11-07)
- Phase 1 plan approved
- Phase 2+3: Home, Menu, Product detail, Cart, Checkout, Order tracking, My orders, Account + addresses, Notifications, Login/Signup/Google, Forgot/Reset password, Policy pages; 19 starter products in 6 categories (editable later)
- Promotion engine (Wed 2+1, first-order, free delivery, coupon SCOOP10 sample, stacking toggle)
- Minimal seller dashboard: overview stats/charts, orders (auto-refresh, status flow, reject with reason, record cash payment, refunds, print receipt), promotions config, audit log
- Tested: iteration_1 (backend 97%, frontend ~92%); all reported issues fixed and verified; test data removed

## Implemented (2026-11-07, Phase 4 + Reorder)
- Admin Products & stock: product/category CRUD, variants with ₹ price + stock, image upload (Emergent object storage, served at /api/files/...), hide/show, delete only when hidden and never ordered
- Admin Coupons: create/edit/deactivate, dates (IST), min order, max discount, usage + per-customer limits, new-customers-only, category/product restrictions, redemption history
- Admin Business settings: business details + logo, delivery fee/min order, delivery/pickup + payment toggles, temporary closure, opening hours, holidays, delivery PIN codes, policy page editor, reviews
- Customer Reorder button on My orders + order page
- Tested: iteration_2 (backend 29/29); reorder multi-item bug fixed afterwards (verified the cart keeps all items)
- 2026-11-07: Added 4 ₹10 water popsicles (Orange, Mango, Lemon Mint, Rainbow Stick Ice); menu repriced so all items are ₹10–₹150 (shakes & sundaes lowered); seed.py updated to match
- 2026-11-07: Minimum shop price is ₹20 — all ₹10 pops moved to ₹20; added Pineapple, Grape, Watermelon, Rose Ice (₹20). Shop address set: Opposite to bus stop, near junction, Gajapathinagaram, Andhra Pradesh 535270. Delivery PIN zones are still the samples 500001–500003
- 2026-11-07: Delivery zones replaced with 535270 "Gajapathinagaram & nearby villages" (all 25 nearby villages share this PIN; default ₹30 fee). New automatic offer "Popsicle Family Pack": any 5 water popsicles for ₹90 (configurable pack size/price in Admin → Promotions; exclusive — never combined with Wed 2+1/first-order; best offer wins)
- 2026-11-07: WhatsApp ordering — floating "Order on WhatsApp" button on all shop pages + "Order on WhatsApp instead" in cart (pre-filled with cart items & total). Uses Business settings → WhatsApp number; hidden until a valid 10-digit Indian mobile is saved (currently placeholder)
- 2026-11-07: Shop WhatsApp set to 6303592919 (buttons live). Seller order panel has a one-tap "Send '<status>' update on WhatsApp" button (accepted, preparing, ready, out for delivery, delivered, cancelled) opening wa.me to the customer with a pre-filled message + tracking link — seller presses send; no automatic WhatsApp API
- 2026-11-07: New-order ding on every seller dashboard page (checks pending orders every 15s, two-tone chime + toast with "Open" that jumps to the order). Sidebar "New order sound: On/Off" toggle saved per browser (components/admin/NewOrderAlert.jsx)
- 2026-11-08: Redesigned all emails (core/email_templates.py): branded header, order number + IST date card, progress bar, itemised list, subtotal/offers/delivery/total, delivery or pickup + payment details, CTA, shop footer (placeholder phone/FSSAI hidden). Separate seller "New order" email with customer phone/email and "Open in seller dashboard" button. Password reset uses the same layout

## Placeholders to replace
Shop phone, WhatsApp, address, city/state/PIN, FSSAI number, policy text, sample delivery PINs 500001–500003, map embed, product photos/prices, testimonials (empty).

## Backlog
- P0 Phase 5: promotion test matrix (days, amounts, customers)
- P1 Phase 6 Razorpay test mode (signature verification, webhooks)
- P2 Phase 7 security hardening (DB/redis-backed rate limits, Alembic migrations); Phase 8 GitHub/deploy/domain (APP_PUBLIC_URL must be set to the live domain)
