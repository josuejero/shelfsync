from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.base import Base
from sqlalchemy import JSON, DateTime, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class CatalogItem(Base):
    __tablename__ = "catalog_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))

    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_item_id: Mapped[str] = mapped_column(String(160), nullable=False)

    title: Mapped[str] = mapped_column(String(400), nullable=False)
    author: Mapped[str | None] = mapped_column(String(240), nullable=True)

    isbn10: Mapped[str | None] = mapped_column(String(10), nullable=True)
    isbn13: Mapped[str | None] = mapped_column(String(13), nullable=True)
    asin: Mapped[str | None] = mapped_column(String(20), nullable=True)

    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("provider", "provider_item_id", name="uq_catalog_items_provider_item"),
    )
