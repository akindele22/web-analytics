from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Product(Base):
    __tablename__ = "products"

    sku: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[str | None] = mapped_column(String(128), nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    total: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_sku: Mapped[str] = mapped_column(ForeignKey("products.sku"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()


class UserProfile(Base):
    """
    User-level attributes that are NOT events (used for segmentation).
    Keep this separate from WebEvent to avoid duplicating data per event.
    """

    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    loyalty_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    previous_purchases: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lifetime_value: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    last_purchase_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class MarketingSpend(Base):
    """
    Ad spend is typically tracked as daily/hourly aggregate by platform/campaign,
    not per user event. This enables ROAS and blended CAC calculations.
    """

    __tablename__ = "marketing_spend"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    spend_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    platform: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # e.g., google, meta, tiktok
    campaign: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    ad_group: Mapped[str | None] = mapped_column(String(128), nullable=True)
    creative: Mapped[str | None] = mapped_column(String(128), nullable=True)

    impressions: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    clicks: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    spend: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="GBP")
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class WebEvent(Base):
    """
    Unified event log for web + marketing-touch + email-touch analytics.

    Examples:
      - page_view, page_exit (with duration), session_start
      - like, add_to_cart, purchase
      - email_open, email_click
      - social_share
      - ad_click (if you choose to forward click events)
    """

    __tablename__ = "web_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_sku: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Attribution / source context (optional)
    platform: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # e.g., web, ios, android
    channel: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # e.g., organic, paid, email
    utm_source: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    utm_medium: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

    advertising_platform: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)  # google/meta/etc
    ad_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    email_campaign_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    social_network: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Interaction details (optional)
    page_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_value: Mapped[float | None] = mapped_column(Float, nullable=True)  # revenue, etc. (optional)

    referrer: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

