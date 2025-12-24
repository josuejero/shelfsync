from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Format(str, Enum):
    ebook = "ebook"
    audiobook = "audiobook"


class AvailabilityStatus(str, Enum):
    available = "available"
    hold = "hold"
    not_owned = "not_owned"


class ProviderBook(BaseModel):
    provider: str
    provider_item_id: str

    title: str
    author: str | None = None

    isbn10: str | None = None
    isbn13: str | None = None
    asin: str | None = None

    # arbitrary provider metadata (deep links, formats, etc.)
    raw: dict[str, Any] = Field(default_factory=dict)


class ProviderAvailability(BaseModel):
    provider: str
    provider_item_id: str

    format: Format
    status: AvailabilityStatus

    copies_available: int | None = None
    copies_total: int | None = None
    holds: int | None = None

    deep_link: str | None = None
