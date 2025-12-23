from __future__ import annotations

from app.models.base import Base
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column


class Library(Base):
    __tablename__ = "libraries"

    # A stable identifier you choose (later phases can replace with provider-driven IDs)
    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
