from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class ImportErrorOut(BaseModel):
    key: str
    error: str


class ImportSummaryOut(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[ImportErrorOut] = Field(default_factory=list)


class ShelfSourceOut(BaseModel):
    id: str
    source_type: str
    provider: str
    source_ref: str
    meta: dict
    is_active: bool
    last_synced_at: datetime | None
    last_sync_status: str | None
    last_sync_error: str | None

    class Config:
        from_attributes = True


class ShelfItemOut(BaseModel):
    id: str
    title: str
    author: str
    isbn10: str | None
    isbn13: str | None
    asin: str | None
    shelf: str | None
    needs_fuzzy_match: bool

    class Config:
        from_attributes = True


class RssConnectIn(BaseModel):
    rss_url: str
    shelf: str | None = "to-read"
    sync_now: bool = True
