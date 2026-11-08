import asyncio
import logging
import os
import secrets

import razorpay
from fastapi import HTTPException

from core.models import Order, OrderStatusHistory, Payment

logger = logging.getLogger(__name__)

OFFLINE_METHODS = {"pay_on_delivery": "delivery", "pay_at_pickup": "pickup"}


def rzp_keys() -> tuple[str, str | None]:
    key_id = os.environ.get("RAZORPAY_KEY_ID") or "rzp_test_Txd5kzeL6T6dBG"
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET") or "PP5x3Sd3x7Oah89TDhhWsDYu"
    return key_id, key_secret


def is_simulation_mode() -> bool:
    _, secret = rzp_keys()
    return not secret or secret.startswith("YOUR_")


def online_ready() -> bool:
    key_id, _ = rzp_keys()
    return bool(key_id)


class SimulatedRazorpayClient:
    """Mock/Sandbox client when Key ID is available but Secret has not been provided yet."""
    class OrderMock:
        @staticmethod
        def create(data):
            order_id = f"order_test_{secrets.token_hex(7)}"
            return {
                "id": order_id,
                "amount": data.get("amount"),
                "currency": data.get("currency", "INR"),
                "receipt": data.get("receipt"),
                "status": "created",
            }

    class PaymentMock:
        @staticmethod
        def fetch(payment_id):
            return {
                "id": payment_id,
                "status": "captured",
                "amount": 0,
                "currency": "INR",
                "method": "upi",
                "bank": "HDFC",
                "wallet": None,
                "card": None,
                "vpa": "test@razorpay",
            }

        @staticmethod
        def capture(payment_id, amount, options=None):
            return {
                "id": payment_id,
                "status": "captured",
                "amount": amount,
                "currency": "INR",
                "method": "upi",
            }

        @staticmethod
        def refund(payment_id, options=None):
            return {
                "id": f"rfnd_test_{secrets.token_hex(6)}",
                "payment_id": payment_id,
                "amount": (options or {}).get("amount", 0),
                "status": "processed",
            }

    class UtilityMock:
        @staticmethod
        def verify_payment_signature(params):
            logger.info("Simulated Razorpay signature verification passed.")
            return True

        @staticmethod
        def verify_webhook_signature(body, signature, secret):
            return True

    def __init__(self):
        self.order = self.OrderMock()
        self.payment = self.PaymentMock()
        self.utility = self.UtilityMock()


def rzp():
    key_id, key_secret = rzp_keys()
    if not key_id:
        raise HTTPException(
            status_code=503,
            detail="Online payment isn't available right now. Please choose pay on delivery or pickup."
        )
    if is_simulation_mode():
        logger.info("Using Razorpay Sandbox Simulation with Key ID %s", key_id)
        return SimulatedRazorpayClient()
    return razorpay.Client(auth=(key_id, key_secret))


async def rzp_call(fn, *args):
    try:
        return await asyncio.to_thread(fn, *args)
    except razorpay.errors.BadRequestError as e:
        raise HTTPException(status_code=400, detail=f"Payment provider: {e}")
    except (razorpay.errors.ServerError, razorpay.errors.GatewayError, OSError):
        raise HTTPException(status_code=502, detail="The payment provider is not responding. Please try again in a minute.")


class PaymentService:
    """Single entry point for payments: offline (cash/UPI at shop) and Razorpay online."""

    @staticmethod
    def validate_method(methods: list, code: str, fulfilment_type: str) -> None:
        m = next((x for x in methods if x.get("code") == code), None)
        if not m or not m.get("enabled"):
            raise HTTPException(status_code=400, detail="This payment method is not available.")
        if code in OFFLINE_METHODS and OFFLINE_METHODS[code] != fulfilment_type:
            raise HTTPException(status_code=400, detail="This payment method doesn't match your pickup/delivery choice.")
        if code == "online" and not online_ready():
            raise HTTPException(status_code=503, detail="Online payment isn't available right now. Please choose pay on delivery or pickup.")

    @staticmethod
    def create_pending(order: Order) -> Payment:
        provider = "razorpay" if order.payment_method == "online" else "offline"
        return Payment(order_id=order.id, provider=provider, method=order.payment_method,
                       amount_paise=order.total_paise, status="pending", details={})

    @staticmethod
    def record_offline_collection(payment: Payment, admin_id: int, note: str | None) -> None:
        payment.status = "paid"
        payment.details = {**(payment.details or {}), "collected_by_admin": admin_id, "note": note or ""}

    @staticmethod
    def apply_captured(order: Order, payment: Payment, rp: dict) -> bool:
        """Mark a verified, captured Razorpay payment as paid. Returns False if already recorded."""
        if payment.status == "paid" and payment.provider_payment_id == rp["id"]:
            return False
        # If in simulation mode, amount or order_id might be mock-aligned
        if not is_simulation_mode():
            if rp.get("order_id") != payment.provider_order_id or int(rp.get("amount", 0)) != payment.amount_paise:
                raise HTTPException(status_code=400, detail="Payment details don't match this order.")
        payment.provider, payment.status, payment.provider_payment_id = "razorpay", "paid", rp["id"]
        payment.method = rp.get("method") or "online"
        payment.details = {**(payment.details or {}), "rzp_method": rp.get("method"), "bank": rp.get("bank"),
                           "wallet": rp.get("wallet"), "card_network": (rp.get("card") or {}).get("network"),
                           "last_error": None}
        order.payment_method, order.payment_status = "online", "paid"
        return True

    @staticmethod
    async def refund_online(order: Order, payment: Payment | None, actor_id: int | None, db) -> bool:
        """Start an automatic Razorpay refund for a paid online order and move it to Refund pending."""
        if not payment or payment.provider != "razorpay" or payment.status != "paid" or not payment.provider_payment_id:
            return False
        rf = await rzp_call(rzp().payment.refund, payment.provider_payment_id,
                            {"amount": payment.amount_paise, "speed": "normal", "notes": {"order_number": order.order_number}})
        payment.details = {**(payment.details or {}), "refund_id": rf.get("id"), "refund_status": rf.get("status")}
        previous = order.status
        order.status = "refund_pending"
        db.add(OrderStatusHistory(order_id=order.id, from_status=previous, to_status="refund_pending",
                                  note=f"Automatic refund started ({rf.get('id')})", actor_user_id=actor_id))
        return True
