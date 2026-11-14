"""SMS / WhatsApp channel layer.

A provider is a tiny adapter with one coroutine `send(to, text, template, params) -> provider_id`.
No provider is wired yet (the shop has no SMS/WhatsApp account), so `get_provider()` returns None
and every attempt is recorded honestly in notification_outbox as "skipped" with the reason.
When a provider account exists, add an adapter here and select it with SMS_PROVIDER / WHATSAPP_PROVIDER.

Message texts are DLT-safe: short, no links, fixed variable set (##otp##, ##order##, ##rider##,
##riderphone##, ##amount##).
"""
import os
from typing import Optional, Protocol


class ProviderNotConfigured(Exception):
    pass


class MessageProvider(Protocol):
    name: str

    async def send(self, to: str, text: str, template: str, params: dict) -> Optional[str]: ...


_PROVIDERS: dict[str, MessageProvider] = {}


def register_provider(channel: str, provider: MessageProvider) -> None:
    _PROVIDERS[channel] = provider


def provider_name(channel: str) -> str:
    return (os.environ.get(f"{channel.upper()}_PROVIDER") or "none").strip().lower()


def get_provider(channel: str) -> Optional[MessageProvider]:
    """Return the configured provider for 'sms' or 'whatsapp', or None when not configured."""
    if channel in _PROVIDERS:
        return _PROVIDERS[channel]
    return None  # SMS_PROVIDER / WHATSAPP_PROVIDER = none (no account yet)


def channel_status() -> dict:
    return {
        "sms": {"provider": provider_name("sms"), "configured": get_provider("sms") is not None},
        "whatsapp": {"provider": provider_name("whatsapp"), "configured": get_provider("whatsapp") is not None},
    }


# DLT-style templates (no links). Keys match notification events.
SMS_TEMPLATES = {
    "placed": "ICEPOPS: we received your order ##order## for Rs ##amount##. We will confirm it shortly.",
    "accepted": "ICEPOPS: your order ##order## is accepted and will be prepared shortly.",
    "ready_for_pickup": "ICEPOPS: your order ##order## is ready. Please collect it from the shop.",
    "out_for_delivery": "Your ICEPOPS order ##order## is out for delivery with ##rider## (##riderphone##). Delivery OTP: ##otp##. Share it only when you receive your order.",
    "otp_resent": "Your ICEPOPS order ##order## is out for delivery with ##rider## (##riderphone##). Delivery OTP: ##otp##. Share it only when you receive your order.",
    "delivered": "ICEPOPS: your order ##order## (Rs ##amount##) has been delivered. Enjoy!",
    "cancelled": "ICEPOPS: your order ##order## was cancelled. Any payment will be refunded.",
    "refund_pending": "ICEPOPS: a refund of Rs ##amount## for order ##order## is being processed.",
    "refunded": "ICEPOPS: the refund of Rs ##amount## for order ##order## is complete.",
}


def render_template(event: str, params: dict) -> Optional[str]:
    tpl = SMS_TEMPLATES.get(event)
    if not tpl:
        return None
    text = tpl
    for k, v in params.items():
        text = text.replace(f"##{k}##", str(v if v is not None else ""))
    return text


def order_params(order, otp: Optional[str] = None) -> dict:
    return {
        "order": order.order_number,
        "amount": f"{order.total_paise // 100}",
        "rider": order.rider_name or "our rider",
        "riderphone": order.rider_phone or "",
        "otp": otp or order.delivery_otp or "",
    }
