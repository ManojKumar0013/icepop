from datetime import date, datetime, time, timezone
from typing import Optional

from sqlalchemy import (
    JSON, BigInteger, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer,
    String, Text, Time, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.db import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


def utcnow():
    return datetime.now(timezone.utc)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now())


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)


class UserRole(Base):
    __tablename__ = "user_roles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)


class User(Timestamped, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(15), unique=True, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    picture: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    language: Mapped[str] = mapped_column(String(5), default="en", server_default="en")
    referral_code: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    wallet_balance_paise: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    roles: Mapped[list[Role]] = relationship(secondary="user_roles", lazy="selectin")

    @property
    def role_names(self) -> list[str]:
        return [r.name for r in self.roles]


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Address(Timestamped, Base):
    __tablename__ = "addresses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(30), default="Home")
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(15))
    line1: Mapped[str] = mapped_column(String(200))
    line2: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    area: Mapped[str] = mapped_column(String(100))
    city: Mapped[str] = mapped_column(String(80))
    pincode: Mapped[str] = mapped_column(String(6))
    instructions: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class Category(Timestamped, Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_popsicle: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Product(Timestamped, Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    name_te: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    description_te: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ingredients: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allergens: Mapped[list] = mapped_column(JSONType, default=list)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_bestseller: Mapped[bool] = mapped_column(Boolean, default=False)
    promo_eligible: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[Category] = relationship(lazy="selectin")
    variants: Mapped[list["ProductVariant"]] = relationship(lazy="selectin", order_by="ProductVariant.sort_order")


class ProductVariant(Timestamped, Base):
    __tablename__ = "product_variants"
    __table_args__ = (CheckConstraint("price_paise >= 0", name="ck_variant_price"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    price_paise: Mapped[int] = mapped_column(Integer)
    sku: Mapped[str] = mapped_column(String(60), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    inventory: Mapped["Inventory"] = relationship(lazy="selectin", uselist=False)


class Inventory(Timestamped, Base):
    __tablename__ = "inventory"
    __table_args__ = (CheckConstraint("quantity >= 0", name="ck_inventory_qty"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"), unique=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=5)
    track_stock: Mapped[bool] = mapped_column(Boolean, default=True)


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"), index=True)
    change: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(40))
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("orders.id"), nullable=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DeliveryZone(Timestamped, Base):
    __tablename__ = "delivery_zones"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    pincode: Mapped[str] = mapped_column(String(6), unique=True)
    delivery_fee_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class BusinessSettings(Base):
    __tablename__ = "business_settings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_name: Mapped[str] = mapped_column(String(100))
    tagline: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    phone: Mapped[str] = mapped_column(String(40))
    whatsapp: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    email: Mapped[str] = mapped_column(String(255))
    address_line: Mapped[str] = mapped_column(String(300))
    city: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    pincode: Mapped[str] = mapped_column(String(20))
    map_embed_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    fssai_number: Mapped[str] = mapped_column(String(40))
    gstin: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    is_temporarily_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    closure_message: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    rush_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    rush_message: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    pickup_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    delivery_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    default_delivery_fee_paise: Mapped[int] = mapped_column(Integer, default=3000)
    min_delivery_order_paise: Mapped[int] = mapped_column(Integer, default=0)
    allow_offer_stacking: Mapped[bool] = mapped_column(Boolean, default=False)
    payment_methods: Mapped[list] = mapped_column(JSONType, default=list)
    testimonials: Mapped[list] = mapped_column(JSONType, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class OpeningHour(Base):
    __tablename__ = "opening_hours"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    weekday: Mapped[int] = mapped_column(Integer, unique=True)
    open_time: Mapped[time] = mapped_column(Time)
    close_time: Mapped[time] = mapped_column(Time)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)


class Holiday(Base):
    __tablename__ = "holidays"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True)
    reason: Mapped[str] = mapped_column(String(200))


class PolicyPage(Timestamped, Base):
    __tablename__ = "policy_pages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    content: Mapped[str] = mapped_column(Text)


class Cart(Timestamped, Base):
    __tablename__ = "carts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    items: Mapped[list["CartItem"]] = relationship(lazy="selectin", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("cart_id", "variant_id", name="uq_cart_variant"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cart_id: Mapped[int] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer)


class Order(Timestamped, Base):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_status_created", "status", "created_at"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_number: Mapped[str] = mapped_column(String(20), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(30), index=True)
    fulfilment_type: Mapped[str] = mapped_column(String(20))
    customer_name: Mapped[str] = mapped_column(String(80))
    customer_phone: Mapped[str] = mapped_column(String(15))
    customer_email: Mapped[str] = mapped_column(String(255))
    address_line1: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    address_line2: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    area: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    pincode: Mapped[Optional[str]] = mapped_column(String(6), nullable=True)
    delivery_instructions: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    preferred_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    subtotal_paise: Mapped[int] = mapped_column(Integer)
    discount_paise: Mapped[int] = mapped_column(Integer, default=0)
    delivery_fee_paise: Mapped[int] = mapped_column(Integer, default=0)
    total_paise: Mapped[int] = mapped_column(Integer)
    pricing_breakdown: Mapped[dict] = mapped_column(JSONType, default=dict)
    coupon_code: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(30))
    payment_status: Mapped[str] = mapped_column(String(20), default="pending")
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    delivery_otp: Mapped[Optional[str]] = mapped_column(String(6), nullable=True)
    rider_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    rider_phone: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    is_pos: Mapped[bool] = mapped_column(Boolean, default=False)
    items: Mapped[list["OrderItem"]] = relationship(lazy="selectin", order_by="OrderItem.id")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(120))
    variant_name: Mapped[str] = mapped_column(String(80))
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    unit_price_paise: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    free_quantity: Mapped[int] = mapped_column(Integer, default=0)
    discount_paise: Mapped[int] = mapped_column(Integer, default=0)
    line_total_paise: Mapped[int] = mapped_column(Integer)


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30))
    note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Payment(Timestamped, Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(30))
    method: Mapped[str] = mapped_column(String(30))
    amount_paise: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    provider_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    provider_payment_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    details: Mapped[dict] = mapped_column(JSONType, default=dict)


class Coupon(Timestamped, Base):
    __tablename__ = "coupons"
    __table_args__ = (CheckConstraint("discount_type in ('percent','flat')", name="ck_coupon_type"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    description: Mapped[str] = mapped_column(String(200), default="")
    discount_type: Mapped[str] = mapped_column(String(10))
    discount_value: Mapped[int] = mapped_column(Integer)
    min_order_paise: Mapped[int] = mapped_column(Integer, default=0)
    max_discount_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    starts_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    usage_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    per_user_limit: Mapped[int] = mapped_column(Integer, default=1)
    new_customers_only: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CouponProduct(Base):
    __tablename__ = "coupon_products"
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)


class CouponCategory(Base):
    __tablename__ = "coupon_categories"
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    coupon_id: Mapped[int] = mapped_column(ForeignKey("coupons.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    discount_paise: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10), default="applied")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Promotion(Timestamped, Base):
    __tablename__ = "promotions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(400))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSONType, default=dict)


class PromotionRedemption(Base):
    __tablename__ = "promotion_redemptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    promotion_id: Mapped[int] = mapped_column(ForeignKey("promotions.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    discount_paise: Mapped[int] = mapped_column(Integer)
    once_key: Mapped[Optional[str]] = mapped_column(String(80), unique=True, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="applied")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoyaltyStamp(Base):
    __tablename__ = "loyalty_stamps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    status: Mapped[str] = mapped_column(String(10), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Review(Timestamped, Base):
    __tablename__ = "reviews"
    __table_args__ = (CheckConstraint("rating between 1 and 5", name="ck_review_rating"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    display_name: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    reply: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    body: Mapped[str] = mapped_column(String(500))
    order_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    channel: Mapped[str] = mapped_column(String(20))
    recipient: Mapped[str] = mapped_column(String(255))
    template: Mapped[str] = mapped_column(String(50))
    order_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20))
    error: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    provider_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    storage_path: Mapped[str] = mapped_column(String(300), unique=True)
    original_filename: Mapped[str] = mapped_column(String(200))
    content_type: Mapped[str] = mapped_column(String(50))
    size: Mapped[int] = mapped_column(Integer)
    uploaded_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    details: Mapped[dict] = mapped_column(JSONType, default=dict)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class CateringInquiry(Timestamped, Base):
    __tablename__ = "catering_inquiries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_name: Mapped[str] = mapped_column(String(80))
    customer_phone: Mapped[str] = mapped_column(String(15))
    customer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(40))
    event_date: Mapped[date] = mapped_column(Date)
    guest_count: Mapped[int] = mapped_column(Integer)
    box_size: Mapped[int] = mapped_column(Integer, default=50)
    flavours_json: Mapped[list] = mapped_column(JSONType, default=list)
    delivery_address: Mapped[str] = mapped_column(String(300))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    quote_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    deposit_paise: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class Subscription(Timestamped, Base):
    __tablename__ = "subscriptions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_name: Mapped[str] = mapped_column(String(80))
    frequency: Mapped[str] = mapped_column(String(20), default="weekly")
    box_size: Mapped[int] = mapped_column(Integer, default=6)
    price_paise: Mapped[int] = mapped_column(Integer)
    preferred_day: Mapped[str] = mapped_column(String(20), default="Saturday")
    preferred_time: Mapped[str] = mapped_column(String(30), default="Evening (5-8 PM)")
    delivery_address: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    next_delivery_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)


class GiftCard(Timestamped, Base):
    __tablename__ = "gift_cards"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    sender_name: Mapped[str] = mapped_column(String(80))
    recipient_name: Mapped[str] = mapped_column(String(80))
    recipient_phone: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    recipient_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    message: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    amount_paise: Mapped[int] = mapped_column(Integer)
    balance_paise: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
