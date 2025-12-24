from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.base import Base
from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    settings = relationship(
        "UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    shelf_sources = relationship("ShelfSource", back_populates="user", cascade="all, delete-orphan")
    shelf_items = relationship("ShelfItem", back_populates="user", cascade="all, delete-orphan")
    sync_runs = relationship("SyncRun", back_populates="user", cascade="all, delete-orphan")
