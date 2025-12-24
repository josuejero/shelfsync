from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ShelfItem(Base):
    __tablename__ = "shelf_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    shelf_source_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("shelf_sources.id", ondelete="SET NULL"), index=True, nullable=True
    )

    # RSS: guid/book_id; CSV: "Book Id" (stringified)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)

    title: Mapped[str] = mapped_column(String(600), nullable=False)
    author: Mapped[str] = mapped_column(String(400), nullable=False)

    isbn10: Mapped[str | None] = mapped_column(String(20), nullable=True)
    isbn13: Mapped[str | None] = mapped_column(String(20), nullable=True)
    asin: Mapped[str | None] = mapped_column(String(20), nullable=True)

    normalized_title: Mapped[str] = mapped_column(String(600), nullable=False)
    normalized_author: Mapped[str] = mapped_column(String(400), nullable=False)

    # A single primary shelf for now (e.g. to-read/read/currently-reading)
    shelf: Mapped[str | None] = mapped_column(String(80), nullable=True)

    needs_fuzzy_match: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user = relationship("User", back_populates="shelf_items")
    shelf_source = relationship("ShelfSource", back_populates="items")


# Idempotency: if an external_id exists, it must be unique per source.
# NOTE: Items without external_id can still duplicate; Phase 3 can improve with additional keys.
Index(
    "ix_shelf_items_source_external_unique",
    ShelfItem.shelf_source_id,
    ShelfItem.external_id,
    unique=True,
    postgresql_where=(ShelfItem.external_id.isnot(None)),
)