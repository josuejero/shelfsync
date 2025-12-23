from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.base import Base
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ShelfSource(Base):
    __tablename__ = "shelf_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # "rss" | "csv"
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # RSS URL or a filename reference (Phase 2 will formalize)
    source_ref: Mapped[str] = mapped_column(String(2000), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    user = relationship("User", back_populates="shelf_sources")
    items = relationship("ShelfItem", back_populates="shelf_source")
