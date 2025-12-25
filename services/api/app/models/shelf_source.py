from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.base import Base
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ShelfSource(Base):
    __tablename__ = "shelf_sources"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # "rss" | "csv"
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # For now: only "goodreads" (later phases can add "libby" etc)
    provider: Mapped[str] = mapped_column(
        String(40), nullable=False, default="goodreads"
    )

    # RSS URL or a logical identifier for CSV imports
    source_ref: Mapped[str] = mapped_column(String(2000), nullable=False)

    # Arbitrary metadata, e.g. {"shelf": "to-read"}
    meta: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Sync metadata
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_sync_status: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )  # "ok" | "error"
    last_sync_error: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user = relationship("User", back_populates="shelf_sources")
    items = relationship(
        "ShelfItem", back_populates="shelf_source", cascade="all, delete-orphan"
    )
