from __future__ import annotations

from datetime import datetime

from app.schemas.dashboard import AvailabilityOut, ReadNextOut
from pydantic import BaseModel


class BookDetailShelfItemOut(BaseModel):
    id: str
    title: str
    author: str | None
    isbn10: str | None
    isbn13: str | None
    asin: str | None
    shelf: str | None
    needs_fuzzy_match: bool


class BookDetailMatchOut(BaseModel):
    catalog_item_id: str
    provider: str
    provider_item_id: str
    method: str
    confidence: float


class BookDetailSourceOut(BaseModel):
    id: str
    source_type: str
    provider: str
    source_ref: str
    last_synced_at: datetime | None
    last_sync_status: str | None
    last_sync_error: str | None


class BookDetailSettingsOut(BaseModel):
    library_system: str | None
    preferred_formats: list[str]


class BookDetailOut(BaseModel):
    shelf_item: BookDetailShelfItemOut
    match: BookDetailMatchOut | None
    availability: list[AvailabilityOut]
    source: BookDetailSourceOut | None
    settings: BookDetailSettingsOut
    read_next: ReadNextOut
    generated_at: datetime
