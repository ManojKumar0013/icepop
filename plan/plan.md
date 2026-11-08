# ICEPOPS — Online Payments, Loyalty Stamp Card, Ratings & Telugu

Customers can pay online with UPI, card or netbanking through Razorpay. They earn a free popsicle for coming back and can rate their orders. Later the whole shop can also be shown in Telugu.

## Who it's for
- **Customers** in Gajapathinagaram and nearby villages who order popsicles often, many of whom prefer UPI or Telugu.
- **The shop owner/seller** (manojkumarbondada13@gmail.com), who takes orders, collects payments and watches reviews.

## Core features and experience

### 1. Razorpay online payments
- At checkout a new option, **"Pay online — UPI, card, netbanking"**, appears next to the current options (pay on delivery, pay at pickup).
- The amount is always worked out by the shop's server, so a customer can't change the price.
- Tapping **Pay ₹110** opens the Razorpay payment window. The order is marked **Paid** only after the shop's server confirms the payment with Razorpay.
- A second, automatic check from Razorpay keeps the order status right even if the customer closes the app halfway through.
- **If a payment fails or is cancelled:** the order stays "Payment pending". The customer sees **Try again**, or can switch to paying on delivery or at pickup. Nothing is charged twice.
- **Refunds:** cancelling a paid order in the seller dashboard sends the refund back through Razorpay automatically.
  - The order shows **Refund pending**, then **Refunded**.
  - The customer gets an email and an in-app notification at each step.
- The seller order panel shows the Razorpay payment reference and how the customer paid (UPI, card or netbanking).
- **Business settings:** turn online payment on or off. Cash/UPI on delivery and pay at pickup stay available.
- **Test mode first:** it starts with Razorpay *test* keys (no real money). It switches to *live* keys only after testing is finished and your Razorpay account is approved.

### 2. Loyalty stamp card
- Each **delivered** order (pickup or delivery) earns 1 stamp. Cancelled or refunded orders don't count.
- **10 stamps = 1 free ₹20 water popsicle**, used on the next order.
- Customers see a 10-slot stamp card in **My account** and in the cart, e.g. "7 of 10 — 3 more orders to a free popsicle".
- When a reward is ready, the cart shows a **"Use my free popsicle"** button. One reward can be used per order.
- The reward can be used with the existing promotions, but not with a coupon, following the shop's one-offer rule.
- The "Delivered" email and notification show the stamp count.
- **Seller controls (Promotions page):**
  - Turn the stamp card on or off.
  - Set how many stamps are needed (default 10).
  - Choose which products can be the free reward.

### 3. Customer ratings
- After an order is **Delivered**, the customer can rate it from **1 to 5 stars** and add a short comment (optional, up to 300 characters). They can do this from the order page or from the link in the "Delivered" email.
- Only customers who bought the product can review it, and each order can be rated once.
- **Product pages** show the average star rating and the number of reviews, with the latest approved reviews below.
- **Home page:** a "What our customers say" strip shows the best approved reviews.
- **Seller dashboard → Reviews:**
  - See every review.
  - **Approve or hide** each one. New reviews stay hidden until approved, so nothing rude goes public.
  - Reply publicly to a review.
- Customers' first names only are shown publicly. Phone numbers and email addresses are never shown.

### 4. Telugu / English switch (Phase 2)
- An **EN | తెలుగు** switch in the top bar. The choice is remembered on that phone.
- What gets translated:
  - Menu, buttons, cart, checkout and order statuses.
  - Notifications and customer emails.
  - Product names and descriptions: the seller can enter a Telugu name and description per product. Where none is given, the English one is shown.
- The seller dashboard stays in English.

## User flow
1. A customer adds popsicles and goes to checkout, then picks **Pay online** → **Pay ₹110**.
2. They pay by UPI in the Razorpay window. The order shows **Paid** and the seller hears the new-order ding.
3. The seller accepts, prepares and delivers the order, then marks it **Delivered**. The customer gets their stamp ("Stamp 4 of 10") and a **Rate your order** link.
4. The customer leaves 5 stars and a comment. The seller approves it and it appears on the product page and the home page.
5. On the 10th delivered order the customer's free popsicle unlocks. They use it with one tap in the cart on their next order.
6. If the seller cancels a paid order, the money goes back automatically and the customer is told.

## UI/UX feel
- Same ICEPOPS look as now: chocolate brown, cream, pink and orange, with rounded cards, phone-first.
- **Payment:** a clear "Pay online" card with UPI, card and netbanking icons. After paying, a big green **Paid** tick; after a failure, a calm "Payment didn't go through — try again" message.
- **Stamp card:** looks like a real punch card. Filled stamps are pink popsicles, empty ones are dashed circles, with a small pop animation when a stamp is earned.
- **Stars:** large stars that are easy to tap. Reviews are shown as warm cream cards.

## Implementation phases
- **Phase 1 (MVP — built now):**
  - Razorpay online payments in **test mode**, including payment checks, retry and automatic refunds.
  - Loyalty stamp card.
  - Customer ratings with seller approval.
- **Phase 2:**
  - Telugu / English switch for the customer shop, notifications and emails.
  - Telugu product names in the product editor.
- **Phase 3:**
  - Switch Razorpay to live keys after your account approval.
  - A low-stock warning.
  - A busy mode to pause orders.
  - A daily sales email.

## Assumptions
- **Razorpay keys are needed from you before payments can be built and tested:**
  - Key ID and Key Secret from Razorpay Dashboard → Settings → API Keys (test mode).
  - A Webhook Secret, which you create in Razorpay Dashboard → Webhooks.
  - A secure pop-up will ask for them. They are never typed into chat.
- Razorpay charges its own fee per payment, about 2% (UPI may be lower). The shop pays it; customers aren't charged extra.
- Online payment is for the full order amount. Part payment and COD advance are not included.
- Stamps count only orders delivered **after** launch. They never expire and can't be swapped for cash.
- Reviews need seller approval before they appear publicly.
- Telugu translations of app text are done as part of Phase 2. The owner can edit product names and descriptions in Telugu.
- Changes reach the live site only after the next publish.
