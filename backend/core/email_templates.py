from datetime import timezone
from html import escape
import re
from zoneinfo import ZoneInfo

from core.config import APP_PUBLIC_URL
from core.models import BusinessSettings, Order
from core.store import paise

IST = ZoneInfo("Asia/Kolkata")
CHOCO, CREAM, PINK, ORANGE, MUTED, LINE = "#3D2314", "#FFF8F0", "#F9A8C9", "#E8461E", "#7A685A", "#F0E4D8"
FONT = "font-family:'Segoe UI',Helvetica,Arial,sans-serif"
PAY_STATUS = {"pending": "Payment pending", "paid": "Paid", "cancelled": "Not charged",
              "refunded": "Refunded", "failed": "Payment failed"}
STEPS = [("placed", "Placed"), ("accepted", "Accepted"), ("preparing", "Preparing"),
         ("on_way", "Ready / On the way"), ("delivered", "Done")]
STEP_OF = {"pending_confirmation": 0, "accepted": 1, "preparing": 2, "ready_for_pickup": 3,
           "out_for_delivery": 3, "delivered": 4}
PAY_METHOD = {"online": "Paid online (Razorpay)", "upi": "UPI (online)", "card": "Card (online)",
              "netbanking": "Netbanking (online)", "wallet": "Wallet (online)"}

CUSTOMER_COPY = {
    "placed": ("Thank you for your order!", "We've received your order and the shop will confirm it shortly. "
               "You'll get an update at every step."),
    "accepted": ("Your order is confirmed", "Good news — the shop has accepted your order and will start preparing it soon."),
    "ready_for_pickup": ("Your order is ready for pickup", "Your treats are packed and waiting. "
                         "Please collect them from the shop at your convenience."),
    "out_for_delivery": ("Your order is on the way", "Our delivery partner has left the shop with your order. "
                         "Please keep your phone handy."),
    "delivered": ("Your order has been delivered", "We hope you enjoy every bite! Thank you for choosing us."),
    "cancelled": ("Your order was cancelled", "Your order has been cancelled. If you paid anything, it will be refunded."),
    "payment_paid": ("Payment received", "We've recorded your payment for this order. Thank you!"),
    "payment_failed": ("Payment did not go through", "Your payment for this order failed. "
                       "Please try again or choose pay on delivery / pickup."),
    "refund_pending": ("Your refund has started", "We've started a refund of the full amount to your original "
                       "payment method. It usually reaches your account in 5–7 working days."),
    "refunded": ("Your refund is complete", "The refund for this order has been processed to your original payment method."),
}


def _ist(dt):
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST).strftime("%d %b %Y, %I:%M %p")


def _real(v):
    return bool(v) and not v.strip().startswith("[")


def _contact(s: BusinessSettings) -> str:
    for v in (s.whatsapp, s.phone):
        digits = "".join(ch for ch in (v or "") if ch.isdigit())[-10:]
        if _real(v) and len(digits) == 10:
            return digits
    return ""


def _button(href, label, bg=CHOCO, fg=CREAM):
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr>'
            f'<td style="background:{bg};border-radius:999px"><a href="{escape(href)}" style="display:inline-block;'
            f'padding:13px 28px;{FONT};font-size:15px;font-weight:700;color:{fg};text-decoration:none">'
            f'{escape(label)}</a></td></tr></table>')


def _section(title, inner):
    return (f'<tr><td style="padding:20px 32px 0"><p style="margin:0 0 10px;{FONT};font-size:11px;font-weight:700;'
            f'letter-spacing:1.5px;text-transform:uppercase;color:{MUTED}">{escape(title)}</p>{inner}</td></tr>')


def _row(left, right, bold=False, color=CHOCO, size=14):
    w = "700" if bold else "400"
    return (f'<tr><td style="padding:5px 0;{FONT};font-size:{size}px;font-weight:{w};color:{color}">{left}</td>'
            f'<td align="right" style="padding:5px 0;{FONT};font-size:{size}px;font-weight:{w};color:{color};'
            f'white-space:nowrap">{right}</td></tr>')


def _items(order: Order) -> str:
    rows = ""
    for it in order.items:
        free = f'<br><span style="color:{ORANGE};font-size:12px;font-weight:700">{it.free_quantity} free</span>' \
            if it.free_quantity else ""
        rows += (f'<tr><td style="padding:10px 0;border-bottom:1px solid {LINE};{FONT};font-size:14px;color:{CHOCO}">'
                 f'<strong>{escape(it.product_name)}</strong><br><span style="color:{MUTED};font-size:12px">'
                 f'{escape(it.variant_name)} · {it.quantity} × {escape(paise(it.unit_price_paise))}</span>{free}</td>'
                 f'<td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid {LINE};{FONT};'
                 f'font-size:14px;font-weight:700;color:{CHOCO};white-space:nowrap">{escape(paise(it.unit_price_paise * it.quantity))}</td></tr>')
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">{rows}</table>'


def _totals(order: Order) -> str:
    rows = _row("Subtotal", escape(paise(order.subtotal_paise)))
    for d in (order.pricing_breakdown or {}).get("discounts", []):
        rows += _row(escape(d.get("label", "Offer")), f"− {escape(paise(d.get('amount_paise', 0)))}", color="#1F8A4C")
    if order.fulfilment_type == "delivery":
        rows += _row("Delivery fee", escape(paise(order.delivery_fee_paise)) if order.delivery_fee_paise else
                     '<span style="color:#1F8A4C;font-weight:700">FREE</span>')
    rows += (f'<tr><td colspan="2" style="padding-top:8px;border-top:2px solid {CHOCO}"></td></tr>'
             + _row("Total", escape(paise(order.total_paise)), bold=True, size=18))
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">{rows}</table>'


def _fulfilment(order: Order, s: BusinessSettings, methods: dict) -> str:
    p = f'style="margin:0 0 4px;{FONT};font-size:14px;line-height:21px;color:{CHOCO}"'
    if order.fulfilment_type == "delivery":
        addr = ", ".join(x for x in [order.address_line1, order.address_line2, order.area, order.city, order.pincode] if x)
        where = f'<p {p}><strong>Home delivery</strong></p><p {p}>{escape(addr)}</p>'
        if order.delivery_instructions:
            where += f'<p {p}><span style="color:{MUTED}">Note:</span> {escape(order.delivery_instructions)}</p>'
    else:
        where = (f'<p {p}><strong>Pickup from shop</strong></p>'
                 f'<p {p}>{escape(s.address_line)}, {escape(s.city)} {escape(s.pincode)}</p>')
    if order.preferred_time:
        where += f'<p {p}><span style="color:{MUTED}">Preferred time:</span> {escape(_ist(order.preferred_time))}</p>'
    pay = PAY_METHOD.get(order.payment_method) if order.payment_method == "online" else None
    pay = pay or methods.get(order.payment_method, order.payment_method.replace("_", " ").title())
    where += (f'<p {p}><span style="color:{MUTED}">Payment:</span> {escape(pay)} · '
              f'<strong>{escape(PAY_STATUS.get(order.payment_status, order.payment_status))}</strong></p>')
    return where


def _progress(order: Order) -> str:
    if order.status not in STEP_OF:
        return ""
    cur = STEP_OF[order.status]
    cells = ""
    for i, (_, label) in enumerate(STEPS):
        done = i <= cur
        cells += (f'<td align="center" width="20%" style="padding:0 2px"><div style="height:6px;border-radius:3px;'
                  f'background:{ORANGE if done else LINE}"></div><p style="margin:6px 0 0;{FONT};font-size:11px;'
                  f'font-weight:{"700" if i == cur else "400"};color:{CHOCO if done else MUTED}">{label}</p></td>')
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px">'
            f'<tr>{cells}</tr></table>')


def _shell(s: BusinessSettings, preheader: str, body_rows: str) -> str:
    num = _contact(s)
    call = f'Call / WhatsApp: <a href="tel:+91{escape(num)}" style="color:{CHOCO}">{escape(num)}</a>' if num else ""
    fssai = f" · FSSAI {escape(s.fssai_number)}" if _real(s.fssai_number) else ""
    addr_parts = [escape(x) for x in [s.address_line, s.city, s.state, s.pincode] if x]
    addr_str = ", ".join(addr_parts) if addr_parts else "India"
    footer = (f'{escape(s.business_name or "ICEPOPS")} · {addr_str}<br>{call}{fssai}<br><br>'
              f'We never ask for your password or card details by email.')
    return (f'<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"></head>'
            f'<body style="margin:0;padding:0;background:{CREAM}">'
            f'<span style="display:none;max-height:0;overflow:hidden;opacity:0">{escape(preheader)}</span>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{CREAM}">'
            f'<tr><td align="center" style="padding:24px 12px">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;'
            f'background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid {LINE}">'
            f'<tr><td style="background:{CHOCO};padding:22px 32px"><span style="{FONT};font-size:24px;font-weight:800;'
            f'letter-spacing:-0.5px;color:{CREAM}">ICE</span><span style="{FONT};font-size:24px;font-weight:800;'
            f'letter-spacing:-0.5px;color:{PINK}">POPS</span><br><span style="{FONT};font-size:12px;color:#D9C7B8">'
            f'{escape(s.tagline or "Handcrafted ice creams & popsicles")}</span></td></tr>'
            f'{body_rows}'
            f'<tr><td style="padding:28px 32px;background:{CREAM};{FONT};font-size:12px;line-height:18px;color:{MUTED}">'
            f'{footer}</td></tr></table></td></tr></table></body></html>')


def _hero(kicker, title, text, order: Order):
    return (f'<tr><td style="padding:32px 32px 4px"><p style="margin:0 0 8px;{FONT};font-size:12px;font-weight:700;'
            f'letter-spacing:1.5px;text-transform:uppercase;color:{ORANGE}">{escape(kicker)}</p>'
            f'<h1 style="margin:0 0 12px;{FONT};font-size:26px;line-height:32px;font-weight:800;color:{CHOCO}">'
            f'{escape(title)}</h1><p style="margin:0;{FONT};font-size:15px;line-height:23px;color:{CHOCO}">{text}</p>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;'
            f'background:{CREAM};border-radius:14px"><tr><td style="padding:14px 18px;{FONT};font-size:13px;color:{MUTED}">'
            f'Order number<br><strong style="font-size:17px;color:{CHOCO}">{escape(order.order_number)}</strong></td>'
            f'<td align="right" style="padding:14px 18px;{FONT};font-size:13px;color:{MUTED}">Placed on<br>'
            f'<strong style="font-size:14px;color:{CHOCO}">{escape(_ist(order.created_at))}</strong></td></tr></table>'
            f'{_progress(order)}</td></tr>')


def _loyalty_block(loyalty: dict, order: Order) -> str:
    need, prog = loyalty["stamps_needed"], loyalty["progress"]
    full = loyalty["available_rewards"] > 0
    dots = "".join(f'<td style="padding:2px"><div style="width:22px;height:22px;border-radius:11px;'
                   f'background:{PINK if (full or i < prog) else "#FFFFFF"};border:2px {"solid" if (full or i < prog) else "dashed"} '
                   f'{CHOCO if (full or i < prog) else "#D9C7B8"}"></div></td>' for i in range(need))
    msg = ("Your card is full — your next water popsicle is FREE. Tap “Use my free popsicle” in the cart." if full
           else f"Stamp {prog} of {need} — just {loyalty['to_next']} more order{'s' if loyalty['to_next'] != 1 else ''} to a free popsicle.")
    return (f'<tr><td style="padding:20px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            f'style="background:{CREAM};border-radius:14px"><tr><td style="padding:16px 18px"><p style="margin:0 0 8px;{FONT};'
            f'font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:{ORANGE}">Your stamp card</p>'
            f'<table role="presentation" cellpadding="0" cellspacing="0"><tr>{dots}</tr></table>'
            f'<p style="margin:10px 0 0;{FONT};font-size:14px;color:{CHOCO}">{escape(msg)}</p></td></tr></table></td></tr>')


CUSTOMER_COPY_TE = {
    "placed": ("మీ ఆర్డర్‌కు ధన్యవాదాలు!", "మీ ఆర్డర్ మాకు అందింది. షాప్ త్వరలో నిర్ధారిస్తుంది. ప్రతి దశలో మీకు సమాచారం వస్తుంది."),
    "accepted": ("మీ ఆర్డర్ నిర్ధారించబడింది", "శుభవార్త — షాప్ మీ ఆర్డర్‌ను అంగీకరించింది, త్వరలో తయారు చేస్తుంది."),
    "ready_for_pickup": ("మీ ఆర్డర్ పికప్‌కు సిద్ధం", "మీ ఆర్డర్ ప్యాక్ చేసి ఉంది. దయచేసి షాప్ నుండి తీసుకెళ్లండి."),
    "out_for_delivery": ("మీ ఆర్డర్ వస్తోంది", "మా డెలివరీ భాగస్వామి మీ ఆర్డర్‌తో బయలుదేరారు. దయచేసి ఫోన్ దగ్గర ఉంచుకోండి."),
    "delivered": ("మీ ఆర్డర్ డెలివరీ అయింది", "ఆనందించండి! ICEPOPS ను ఎంచుకున్నందుకు ధన్యవాదాలు."),
    "cancelled": ("మీ ఆర్డర్ రద్దు అయింది", "మీ ఆర్డర్ రద్దు చేయబడింది. మీరు చెల్లించి ఉంటే, ఆ మొత్తం తిరిగి ఇస్తాము."),
    "payment_paid": ("చెల్లింపు అందింది", "ఈ ఆర్డర్‌కు మీ చెల్లింపు నమోదైంది. ధన్యవాదాలు!"),
    "payment_failed": ("చెల్లింపు పూర్తి కాలేదు", "దయచేసి మళ్ళీ ప్రయత్నించండి లేదా డెలివరీ/పికప్ సమయంలో చెల్లించండి."),
    "refund_pending": ("మీ రీఫండ్ ప్రారంభమైంది", "పూర్తి మొత్తం మీ అసలు చెల్లింపు విధానానికి తిరిగి వస్తుంది. సాధారణంగా 5–7 పని రోజులు పడుతుంది."),
    "refunded": ("మీ రీఫండ్ పూర్తయింది", "ఈ ఆర్డర్ రీఫండ్ మీ అసలు చెల్లింపు విధానానికి పంపబడింది."),
}
LABELS_TE = {"Hi": "నమస్కారం", "Order update": "ఆర్డర్ అప్‌డేట్", "Your items": "మీ వస్తువులు",
             "Delivery & payment": "డెలివరీ & చెల్లింపు", "Pickup & payment": "పికప్ & చెల్లింపు",
             "Track your order": "మీ ఆర్డర్ చూడండి", "Rate your order": "మీ ఆర్డర్‌కి రేటింగ్ ఇవ్వండి",
             "Questions? Just call or WhatsApp us on": "సందేహాలు ఉన్నాయా? కాల్ లేదా WhatsApp చేయండి:"}


def customer_order_email(order: Order, event: str, s: BusinessSettings, loyalty: dict | None = None,
                         lang: str = "en") -> tuple[str, str]:
    L = (lambda k: LABELS_TE.get(k, k)) if lang == "te" else (lambda k: k)
    methods = {m.get("code"): m.get("label") for m in (s.payment_methods or [])}
    title, text = (CUSTOMER_COPY_TE if lang == "te" else CUSTOMER_COPY)[event]
    body = f"{L('Hi')} {escape(order.customer_name)},<br>{escape(text)}"
    if event == "cancelled" and order.cancel_reason:
        body += f'<br><br><span style="color:{MUTED}">Reason:</span> {escape(order.cancel_reason)}'
    rows = (_hero(f"{L('Order update')} · {paise(order.total_paise)}", title, body, order)
            + (_loyalty_block(loyalty, order) if loyalty else "")
            + (f'<tr><td style="padding:4px 32px 0">{_button(f"{APP_PUBLIC_URL}/orders/{order.order_number}#rate", L("Rate your order"), ORANGE, "#FFFFFF")}</td></tr>'
               if event == "delivered" else "")
            + _section(L("Your items"), _items(order) + _totals(order))
            + _section(L("Delivery & payment") if order.fulfilment_type == "delivery" else L("Pickup & payment"),
                       _fulfilment(order, s, methods))
            + f'<tr><td style="padding:4px 32px 28px">{_button(f"{APP_PUBLIC_URL}/orders/{order.order_number}", L("Track your order"))}'
              + (f'<p style="margin:8px 0 0;{FONT};font-size:13px;color:{MUTED}">{L("Questions? Just call or WhatsApp us on")} '
                 f'{escape(_contact(s))}.</p>' if _contact(s) else "") + '</td></tr>')
    subject = f"{title} · {order.order_number}"
    return subject, _shell(s, f"{title} — order {order.order_number}, total {paise(order.total_paise)}", rows)


def seller_new_order_email(order: Order, s: BusinessSettings) -> tuple[str, str]:
    methods = {m.get("code"): m.get("label") for m in (s.payment_methods or [])}
    mode = "Delivery" if order.fulfilment_type == "delivery" else "Pickup"
    p = f'style="margin:0 0 4px;{FONT};font-size:14px;line-height:21px;color:{CHOCO}"'
    phone = escape(order.customer_phone)
    customer = (f'<p {p}><strong>{escape(order.customer_name)}</strong></p>'
                f'<p {p}>Phone: <a href="tel:+91{phone}" style="color:{CHOCO};font-weight:700">{phone}</a></p>'
                f'<p {p}>Email: {escape(order.customer_email)}</p>')
    count = sum(i.quantity for i in order.items)
    text = (f"<strong>{escape(order.customer_name)}</strong> placed a <strong>{mode.lower()}</strong> order for "
            f"<strong>{count} item{'s' if count != 1 else ''}</strong>. Please accept it from your seller dashboard.")
    rows = (_hero(f"New order · {mode}", f"New order — {paise(order.total_paise)}", text, order)
            + _section("Customer", customer)
            + _section("Items to prepare", _items(order) + _totals(order))
            + _section(mode, _fulfilment(order, s, methods))
            + f'<tr><td style="padding:4px 32px 28px">'
              f'{_button(f"{APP_PUBLIC_URL}/admin/orders?open={order.order_number}", "Open in seller dashboard", ORANGE, "#FFFFFF")}'
              f'</td></tr>')
    subject = f"New order {order.order_number} · {paise(order.total_paise)} · {mode}"
    return subject, _shell(s, f"{order.customer_name} · {count} items · {paise(order.total_paise)}", rows)


def password_reset_email(name: str, link: str, s: BusinessSettings) -> str:
    rows = (f'<tr><td style="padding:32px"><h1 style="margin:0 0 12px;{FONT};font-size:26px;font-weight:800;'
            f'color:{CHOCO}">Reset your password</h1><p style="margin:0;{FONT};font-size:15px;line-height:23px;'
            f'color:{CHOCO}">Hi {escape(name)}, we received a request to reset your {escape(s.business_name)} password. '
            f'This link is valid for 60 minutes and can be used once.</p>{_button(link, "Choose a new password")}'
            f'<p style="margin:8px 0 0;{FONT};font-size:13px;color:{MUTED}">If you didn\'t request this, you can safely '
            f'ignore this email.</p></td></tr>')
    return _shell(s, "Reset your password", rows)


def signup_otp_email(name: str, otp: str, s: BusinessSettings) -> tuple[str, str]:
    tagline = s.tagline or "Handcrafted pops & scoops, made fresh every day"
    subject = f"{otp} is your verification code · {s.business_name}"
    preheader = f"Your {s.business_name} verification code is {otp}. Valid for 10 minutes."
    greeting_name = escape(name.strip()) if name and name.strip() else "there"

    # Build 6 styled individual digit boxes for high-end visual design
    clean_otp = re.sub(r"\D", "", otp)[:6].ljust(6, "0")
    digit_cells = "".join(
        f'<td align="center" style="padding:0 4px">'
        f'<div style="width:42px;height:52px;line-height:52px;background:#FFFFFF;'
        f'border:2px solid {ORANGE};border-radius:12px;{FONT};font-size:28px;'
        f'font-weight:900;color:{CHOCO};text-align:center;box-shadow:0 3px 8px rgba(232,70,30,0.12)">'
        f'{escape(d)}</div></td>'
        for d in clean_otp
    )

    otp_card = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;'
        f'background:{CREAM};border-radius:18px;border:1px solid {LINE};overflow:hidden">'
        f'<tr><td style="padding:24px 20px;text-align:center">'
        f'<p style="margin:0 0 12px;{FONT};font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:{MUTED}">'
        f'One-Time Verification Code (OTP)</p>'
        f'<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px">'
        f'<tr>{digit_cells}</tr></table>'
        f'<div style="display:inline-block;padding:5px 14px;background:#FFF3EB;border-radius:999px;border:1px solid #FCD9C6;'
        f'{FONT};font-size:12px;font-weight:700;color:{ORANGE}">'
        f'&#9201; Valid for 10 minutes</div>'
        f'<p style="margin:10px 0 0;{FONT};font-size:12px;color:{MUTED}">'
        f'For your safety, never share this code or your password with anyone.</p>'
        f'</td></tr></table>'
    )

    perks_html = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">'
        f'<tr><td style="padding:12px 0;border-bottom:1px solid {LINE};{FONT};font-size:14px;color:{CHOCO}">'
        f'<strong>Free Welcome Popsicle &#127847;</strong><br><span style="color:{MUTED};font-size:12px">'
        f'1 complimentary water popsicle on your first order above &#8377;50</span></td>'
        f'<td align="right" valign="middle" style="padding:12px 0;border-bottom:1px solid {LINE};{FONT};'
        f'font-size:11px;font-weight:800;letter-spacing:0.5px;color:#1F8A4C;white-space:nowrap">WELCOME GIFT</td></tr>'
        f'<tr><td style="padding:12px 0;border-bottom:1px solid {LINE};{FONT};font-size:14px;color:{CHOCO}">'
        f'<strong>Digital Stamp Card &#11088;</strong><br><span style="color:{MUTED};font-size:12px">'
        f'Collect stamps with every order to unlock free popsicles</span></td>'
        f'<td align="right" valign="middle" style="padding:12px 0;border-bottom:1px solid {LINE};{FONT};'
        f'font-size:11px;font-weight:800;letter-spacing:0.5px;color:{ORANGE};white-space:nowrap">REWARDS</td></tr>'
        f'<tr><td style="padding:12px 0;{FONT};font-size:14px;color:{CHOCO}">'
        f'<strong>Refer & Earn &#8377;10 &#127873;</strong><br><span style="color:{MUTED};font-size:12px">'
        f'Give &#8377;10 to friends and get &#8377;10 in your wallet after their first order</span></td>'
        f'<td align="right" valign="middle" style="padding:12px 0;{FONT};'
        f'font-size:11px;font-weight:800;letter-spacing:0.5px;color:{CHOCO};white-space:nowrap">&#8377;10 WALLET</td></tr>'
        f'</table>'
    )

    rows = (
        f'<tr><td style="padding:32px 32px 6px">'
        f'<p style="margin:0 0 8px;{FONT};font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:{ORANGE}">'
        f'NEW ACCOUNT &bull; EMAIL VERIFICATION</p>'
        f'<h1 style="margin:0 0 12px;{FONT};font-size:26px;line-height:32px;font-weight:800;color:{CHOCO}">'
        f'Verify your email address</h1>'
        f'<p style="margin:0;{FONT};font-size:15px;line-height:23px;color:{CHOCO}">'
        f'Hi <strong>{greeting_name}</strong>, welcome to <strong>{escape(s.business_name)}</strong>! '
        f'You&#39;re just one step away from chilled, handcrafted happiness. '
        f'Please enter the 6-digit verification code below to verify your email and activate your account.'
        f'</p>'
        f'{otp_card}'
        f'</td></tr>'
        + _section("What's waiting for you", perks_html)
        + f'<tr><td style="padding:16px 32px 28px">'
          f'<p style="margin:0;{FONT};font-size:13px;line-height:20px;color:{MUTED}">'
          f'If you did not request this verification code, you can safely ignore this email. No account will be created without this code.'
          f'</p></td></tr>'
    )
    return subject, _shell(s, preheader, rows)
    return subject, _shell(s, preheader, rows)

