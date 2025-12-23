from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.base import Base
from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ShelfItem(Base):
    __tablename__ = "shelf_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    shelf_source_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("shelf_sources.id", ondelete="SET NULL"), index=True
    )

    title: Mapped[str] = mapped_column(String(600), nullable=False)
    author: Mapped[str] = mapped_column(String(400), nullable=False)

    # Phase 2 adds: ISBN/ASIN fields + normalized keys
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    user = relationship("User", back_populates="shelf_items")
    shelf_source = relationship("ShelfSource", back_populates="items")


Index("ix_shelf_items_user_title_author", ShelfItem.user_id, ShelfItem.title, ShelfItem.author)
