from __future__ import annotations

from datetime import datetime, timezone

from app.models.base import Base
from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    # Selected library system identifier (later phases can formalize this)
    library_system: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Example: ["ebook", "audiobook"]
    preferred_formats: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user = relationship("User", back_populates="settings")
