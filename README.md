# 🍨 ICEPOPS — Handcrafted Popsicles & Scoops

> A modern, full-stack artisanal ice cream parlour e-commerce and real-time business management web application built for local operations in **Gajapathinagaram, Andhra Pradesh (PIN 535270)**, India.

---

## 🚀 Key Features

### 🛍️ Customer Experience
- **Mobile-First Shop**: Handcrafted water popsicles, cream popsicles, cones, scoops, thick shakes, and sundaes.
- **Smart Promotions Engine**:
  - **Wednesday Special**: Buy 2 water popsicles, get 1 free automatically.
  - **Popsicle Family Pack**: Any 5 water popsicles for ₹90.
  - **First Order Offer**: Free water popsicle on first order above ₹50.
  - **Free Delivery**: Free doorstep delivery on orders ₹100+.
  - **Coupon Engine**: Percentage or flat discounts with minimum order thresholds and category/product restrictions.
- **10-Stamp Loyalty Card**: Every delivered order earns 1 stamp; 10 stamps unlocks a free ₹20 popsicle.
- **Online & Offline Payments**:
  - **Razorpay Online Payments**: Pay with UPI (GPay, PhonePe, Paytm), Credit/Debit Card, or Netbanking.
  - **Pay on Delivery / Pay at Counter**: Cash or UPI on arrival.
  - **Auto-Refunds**: Automated Razorpay refund initiation upon order cancellation.
- **Real-Time Live Order Tracking (SSE)**: Instant timeline updates without page reloads using Server-Sent Events.
- **WhatsApp Ordering**: 1-tap "Order on WhatsApp" floating button with pre-filled cart items & totals.
- **Bilingual Interface**: Seamless instant toggle between **English** and **Telugu (తెలుగు)**.
- **Customer Reviews**: 1–5 star ratings and reviews published after shop moderation.
- **Progressive Web App (PWA)**: Installable directly to Android and iOS home screens.

### 🛡️ Admin & Seller Dashboard
- **Live Orders Manager**: Real-time order status flow (`Pending` → `Accepted` → `Preparing` → `Ready / Out for delivery` → `Delivered`), audio ding chimes, and receipt printing.
- **1-Tap WhatsApp Customer Updates**: Click to send formatted tracking messages directly to customer WhatsApp via `wa.me`.
- **Catalog & Stock Management**: Product and variant CRUD, category ordering, and local/cloud image uploads.
- **Low-Stock Inventory Warnings**: Automated parlour warnings when flavours drop below safety thresholds.
- **Rush Hour / Pause Orders Mode**: Instant parlour toggle to pause new orders during peak rushes.
- **Sales & Accounting Export**: 1-click CSV download of all sales records for GST and bookkeeping.
- **Business Controls**: Store opening hours, holiday calendar, delivery PIN codes, and legal policy pages.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.11+, FastAPI, Uvicorn, SQLAlchemy 2 (async), asyncpg, Pydantic v2 |
| **Database** | PostgreSQL (Neon / Supabase / Local PostgreSQL) |
| **Frontend** | React 19, React Router v7, Tailwind CSS, Radix UI / shadcn components, Lucide Icons |
| **Payments** | Razorpay SDK (Online UPI / Cards / Netbanking + Webhooks) |
| **Real-Time** | Server-Sent Events (SSE) via FastAPI StreamingResponse |
| **Storage** | Local disk storage with pluggable Cloud Object Storage |

---

## 📦 Quick Start & Local Setup

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+** & npm / yarn
- **PostgreSQL 14+** (local or free cloud database on [Neon.tech](https://neon.tech))

### 2. Configure Environment Variables
Copy `.env.example` in both backend and frontend:
```bash
# In backend/
cp .env.example .env

# In frontend/
cp .env.example .env
```

Your `backend/.env` should contain:
```ini
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/icepops
ADMIN_EMAIL=manojkumarbondada13@gmail.com
ADMIN_PASSWORD=Admin@12345
APP_PUBLIC_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Razorpay Online Payments (Test Mode)
RAZORPAY_KEY_ID=rzp_test_Txd5kzeL6T6dBG
RAZORPAY_KEY_SECRET=your_razorpay_secret_here
```

### 3. Backend Setup
```bash
cd backend
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```
> The database schema and seed catalog (water pops, creams, shakes, cones) are automatically created on first startup!

### 4. Frontend Setup
```bash
cd frontend
npm install --legacy-peer-deps
npm start
```

Visit **`http://localhost:3000`** in your browser.
- **Customer Shop**: `http://localhost:3000`
- **Seller Dashboard**: `http://localhost:3000/admin` (Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`)

---

## 💳 Razorpay Payment Configuration
1. Open your [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Go to **Settings → API Keys** in Test Mode.
3. Your Test Key ID is configured: `rzp_test_Txd5kzeL6T6dBG`.
4. Copy your **Key Secret** and paste it into `backend/.env`:
   ```ini
   RAZORPAY_KEY_SECRET=<your_secret>
   ```
5. *(Optional)* Set up Webhooks:
   - Webhook URL: `https://<your-domain>/api/payments/razorpay/webhook`
   - Active Events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`
   - Set `RAZORPAY_WEBHOOK_SECRET` in `backend/.env`.

---

## 🔒 Security & Architecture Features
- **X-CSRF-Guard**: Custom CSRF header validation on all unsafe HTTP methods (`POST`, `PUT`, `DELETE`).
- **Secure HttpOnly Cookie Sessions**: SHA256 hashed session tokens with 7-day expiration.
- **Unified 400 Validation Handling**: Human-friendly error messages formatted from Pydantic schema validation.
- **Fail-Safe Decoupling**: Automatic local filesystem storage and console email simulation when external third-party services are unconfigured.

---

## 📄 License & Brand
Proprietary software built for **ICEPOPS Parlour**, Gajapathinagaram, Andhra Pradesh, India. All rights reserved.
