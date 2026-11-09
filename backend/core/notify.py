import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import APP_PUBLIC_URL, ADMIN_EMAIL
from core.db import SessionLocal
from core.emailer import EMAIL_FROM_NAME, EmailError, send_email
from core.models import Notification, NotificationOutbox, Order, Role, User, UserRole
from core.email_templates import customer_order_email, password_reset_email, seller_new_order_email
from core.loyalty import loyalty_promo, loyalty_status
from core.store import get_settings, paise

import asyncio
from typing import Set

logger = logging.getLogger(__name__)


class OrderEventBroadcaster:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self._subscribers.discard(q)

    async def broadcast(self, data: dict):
        for q in list(self._subscribers):
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                self._subscribers.discard(q)


broadcaster = OrderEventBroadcaster()

STATUS_LABELS = {
    "pending_confirmation": "Pending confirmation",
    "accepted": "Accepted",
    "preparing": "Preparing",
    "ready_for_pickup": "Ready for pickup",
    "out_for_delivery": "Out for delivery",
    "delivered": "Delivered",
    "cancelled": "Cancelled",
    "refund_pending": "Refund pending",
    "refunded": "Refunded",
}

CUSTOMER_MESSAGES = {
    "placed": ("Order placed", "We've received order {n}. We'll confirm it shortly."),
    "accepted": ("Order accepted", "Order {n} has been accepted by the shop."),
    "preparing": ("Being prepared", "We're preparing order {n} right now."),
    "ready_for_pickup": ("Ready for pickup", "Order {n} is ready. Please collect it from the shop."),
    "out_for_delivery": ("Out for delivery", "Order {n} is on its way to you."),
    "delivered": ("Delivered", "Order {n} has been delivered. Enjoy!"),
    "cancelled": ("Order cancelled", "Order {n} was cancelled. {reason}"),
    "refund_pending": ("Refund initiated", "A refund for order {n} is being processed."),
    "refunded": ("Refunded", "Your refund for order {n} has been completed."),
    "payment_paid": ("Payment received", "Payment for order {n} has been recorded."),
    "payment_failed": ("Payment failed", "Payment for order {n} did not go through."),
}
CUSTOMER_MESSAGES_TE = {
    "placed": ("ఆర్డర్ అందింది", "మీ ఆర్డర్ {n} మాకు అందింది. త్వరలో నిర్ధారిస్తాము."),
    "accepted": ("ఆర్డర్ అంగీకరించబడింది", "ఆర్డర్ {n} ను షాప్ అంగీకరించింది."),
    "preparing": ("తయారవుతోంది", "మీ ఆర్డర్ {n} ఇప్పుడు తయారవుతోంది."),
    "ready_for_pickup": ("పికప్‌కు సిద్ధం", "ఆర్డర్ {n} సిద్ధంగా ఉంది. దయచేసి షాప్ నుండి తీసుకెళ్లండి."),
    "out_for_delivery": ("డెలివరీకి బయలుదేరింది", "ఆర్డర్ {n} మీ దగ్గరకు వస్తోంది."),
    "delivered": ("డెలివరీ అయింది", "ఆర్డర్ {n} డెలివరీ అయింది. ఆనందించండి!"),
    "cancelled": ("ఆర్డర్ రద్దు అయింది", "ఆర్డర్ {n} రద్దు చేయబడింది. {reason}"),
    "refund_pending": ("రీఫండ్ ప్రారంభమైంది", "ఆర్డర్ {n} రీఫండ్ ప్రాసెస్ అవుతోంది."),
    "refunded": ("రీఫండ్ పూర్తయింది", "ఆర్డర్ {n} రీఫండ్ పూర్తయింది."),
    "payment_paid": ("చెల్లింపు అందింది", "ఆర్డర్ {n} చెల్లింపు నమోదైంది."),
    "payment_failed": ("చెల్లింపు విఫలమైంది", "ఆర్డర్ {n} చెల్లింపు పూర్తి కాలేదు."),
}
EMAIL_EVENTS = {"placed", "accepted", "cancelled", "ready_for_pickup", "out_for_delivery", "delivered",
                "payment_paid", "payment_failed", "refund_pending", "refunded"}


async def admin_ids(db: AsyncSession) -> list[int]:
    return list((await db.execute(
        select(UserRole.user_id).join(Role, Role.id == UserRole.role_id).where(Role.name == "admin"))).scalars())


async def user_lang(db: AsyncSession, user_id: int) -> str:
    u = await db.get(User, user_id)
    return "te" if u and u.language == "te" else "en"


async def notify_order_event(db: AsyncSession, order: Order, event: str, extra: str = "") -> None:
    lang = await user_lang(db, order.user_id)
    title, body = (CUSTOMER_MESSAGES_TE if lang == "te" else CUSTOMER_MESSAGES)[event]
    text = body.format(n=order.order_number, reason=order.cancel_reason or "").strip()
    db.add(Notification(user_id=order.user_id, title=title, order_number=order.order_number,
                        body=f"{text} {extra}".strip()[:500]))
    if event == "placed":
        for uid in await admin_ids(db):
            db.add(Notification(user_id=uid, title="New order received", order_number=order.order_number,
                                body=f"{order.order_number} · {order.customer_name} · {paise(order.total_paise)} · {order.fulfilment_type}"))
    await broadcaster.broadcast({
        "event": event,
        "order_number": order.order_number,
        "status": order.status,
        "status_label": STATUS_LABELS.get(order.status, order.status),
        "user_id": order.user_id,
        "customer_name": order.customer_name,
        "total_paise": order.total_paise,
        "fulfilment_type": order.fulfilment_type,
        "payment_status": getattr(order, "payment_status", "pending"),
        "payment_method": getattr(order, "payment_method", "online"),
    })


async def _record(db, channel, recipient, template, order_number, status, error=None, provider_id=None):
    db.add(NotificationOutbox(channel=channel, recipient=recipient, template=template, order_number=order_number,
                              status=status, error=error, provider_id=provider_id))


async def deliver_external(order_id: int, event: str) -> None:
    """Background task: email + WhatsApp hand-off, each recorded in the outbox with its real status."""
    async with SessionLocal() as db:
        order = await db.get(Order, order_id)
        if not order or event not in EMAIL_EVENTS:
            return
        settings = await get_settings(db)
        loyalty = None
        if event == "delivered":
            promo = await loyalty_promo(db)
            if promo and promo.is_enabled:
                loyalty = await loyalty_status(db, order.user_id, promo)
        subject, html = customer_order_email(order, event, settings, loyalty, await user_lang(db, order.user_id))
        # Deliver customer email if a valid recipient is available
        if order.customer_email and not order.customer_email.endswith("@customer.icepops.in") and "@" in order.customer_email:
            try:
                pid = await send_email(to=order.customer_email, subject=subject, html=html)
                await _record(db, "email", order.customer_email, event, order.order_number, "sent", provider_id=pid)
                logger.info("Order %s customer email sent to %s (id: %s)", order.order_number, order.customer_email, pid)
            except (EmailError, ValueError) as e:
                logger.warning("Order %s customer email failed: %s", order.order_number, e)
                await _record(db, "email", order.customer_email, event, order.order_number, "failed", error=str(e)[:300])
        else:
            await _record(db, "email", order.customer_email or "unspecified", event, order.order_number, "skipped",
                          error="No real customer email provided (guest phone order)")
        await _record(db, "whatsapp", order.customer_phone, event, order.order_number, "not_connected",
                      error="WhatsApp provider not connected yet")
        if event == "placed":
            try:
                s_subject, s_html = seller_new_order_email(order, settings)
                pid = await send_email(to=ADMIN_EMAIL, subject=s_subject, html=s_html)
                await _record(db, "email", ADMIN_EMAIL, "seller_new_order", order.order_number, "sent", provider_id=pid)
                logger.info("Order %s seller alert email sent to admin %s (id: %s)", order.order_number, ADMIN_EMAIL, pid)
            except (EmailError, ValueError) as e:
                logger.warning("Order %s seller alert email failed: %s", order.order_number, e)
                await _record(db, "email", ADMIN_EMAIL, "seller_new_order", order.order_number, "failed", error=str(e)[:300])
        await db.commit()


async def send_password_reset(user: User, token: str) -> None:
    link = f"{APP_PUBLIC_URL}/reset-password?token={token}"
    async with SessionLocal() as db:
        html = password_reset_email(user.name, link, await get_settings(db))
        try:
            pid = await send_email(to=user.email, subject=f"{EMAIL_FROM_NAME}: reset your password", html=html)
            await _record(db, "email", user.email, "password_reset", None, "sent", provider_id=pid)
        except (EmailError, ValueError) as e:
            await _record(db, "email", user.email, "password_reset", None, "failed", error=str(e)[:300])
        await db.commit()
