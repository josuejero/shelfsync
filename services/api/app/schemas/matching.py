from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class CatalogItemOut(BaseModel):
    id: str
    provider: str
    provider_item_id: str
    title: str
    author: str | None
    isbn10: str | None
    isbn13: str | None
    asin: str | None


class AvailabilityOut(BaseModel):
    format: str
    status: str
    copies_available: int | None
    copies_total: int | None
    holds: int | None
    deep_link: str | None
    last_checked_at: datetime


class MatchOut(BaseModel):
    shelf_item_id: str
    catalog_item: CatalogItemOut
    method: str
    confidence: float
    evidence: dict
    availability: list[AvailabilityOut]


class RefreshEnqueuedOut(BaseModel):
    job_id: str


class JobStatusOut(BaseModel):
    id: str
    status: str
    created_at: datetime | None
    started_at: datetime | None
    ended_at: datetime | None
    result: dict | None
    exc_info: str | None
