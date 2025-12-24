from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.base import Base
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class AvailabilitySnapshot(Base):
    __tablename__ = "availability_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    catalog_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("catalog_items.id", ondelete="CASCADE"), nullable=False, index=True
    )

    format: Mapped[str] = mapped_column(String(20), nullable=False)  # ebook | audiobook
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # available | hold | not_owned

    copies_available: Mapped[int | None] = mapped_column(Integer, nullable=True)
    copies_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    holds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    deep_link: Mapped[str | None] = mapped_column(String(500), nullable=True)

    last_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "catalog_item_id", "format", name="uq_avail_user_item_format"),
    )
