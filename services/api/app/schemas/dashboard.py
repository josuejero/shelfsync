from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class MatchMiniOut(BaseModel):
    catalog_item_id: str
    provider: str
    provider_item_id: str
    method: str
    confidence: float


class AvailabilityOut(BaseModel):
    format: str
    status: str
    copies_available: int | None
    copies_total: int | None
    holds: int | None
    deep_link: str | None
    last_checked_at: datetime


class ReadNextOut(BaseModel):
    score: float
    tier: str
    best_format: str | None
    hold_ratio: float | None
    reasons: list[str]


class DashboardRowOut(BaseModel):
    shelf_item_id: str
    title: str
    author: str | None
    shelf: str | None
    needs_fuzzy_match: bool

    match: MatchMiniOut | None
    availability: list[AvailabilityOut]
    read_next: ReadNextOut


class LastSyncOut(BaseModel):
    source_type: str | None
    source_id: str | None
    last_synced_at: datetime | None
    last_sync_status: str | None
    last_sync_error: str | None


class PageOut(BaseModel):
    limit: int
    offset: int
    total: int


class DashboardOut(BaseModel):
    settings: dict
    last_sync: LastSyncOut
    page: PageOut
    items: list[DashboardRowOut]
