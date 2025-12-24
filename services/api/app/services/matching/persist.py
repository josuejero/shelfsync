from __future__ import annotations

from datetime import datetime, timezone

from app.models.availability_snapshot import AvailabilitySnapshot
from app.models.catalog_item import CatalogItem
from app.models.catalog_match import CatalogMatch
from app.services.catalog.types import ProviderAvailability, ProviderBook
from sqlalchemy import select
from sqlalchemy.orm import Session


def upsert_catalog_item(db: Session, book: ProviderBook) -> CatalogItem:
    existing = db.execute(
        select(CatalogItem)
        .where(CatalogItem.provider == book.provider)
        .where(CatalogItem.provider_item_id == book.provider_item_id)
    ).scalar_one_or_none()

    if existing:
        existing.title = book.title
        existing.author = book.author
        existing.isbn10 = book.isbn10
        existing.isbn13 = book.isbn13
        existing.asin = book.asin
        existing.raw = book.raw
        return existing

    item = CatalogItem(
        provider=book.provider,
        provider_item_id=book.provider_item_id,
        title=book.title,
        author=book.author,
        isbn10=book.isbn10,
        isbn13=book.isbn13,
        asin=book.asin,
        raw=book.raw,
    )
    db.add(item)
    return item


def upsert_match(
    db: Session,
    *,
    user_id: str,
    shelf_item_id: str,
    catalog_item_id: str,
    provider: str,
    method: str,
    confidence: float,
    evidence: dict,
) -> CatalogMatch:
    existing = db.execute(
        select(CatalogMatch)
        .where(CatalogMatch.user_id == user_id)
        .where(CatalogMatch.shelf_item_id == shelf_item_id)
    ).scalar_one_or_none()

    if existing:
        existing.catalog_item_id = catalog_item_id
        existing.provider = provider
        existing.method = method
        existing.confidence = confidence
        existing.evidence = evidence
        return existing

    m = CatalogMatch(
        user_id=user_id,
        shelf_item_id=shelf_item_id,
        catalog_item_id=catalog_item_id,
        provider=provider,
        method=method,
        confidence=confidence,
        evidence=evidence,
    )
    db.add(m)
    return m


def upsert_availability_snapshot(
    db: Session,
    *,
    user_id: str,
    catalog_item_id: str,
    a: ProviderAvailability,
) -> AvailabilitySnapshot:
    existing = db.execute(
        select(AvailabilitySnapshot)
        .where(AvailabilitySnapshot.user_id == user_id)
        .where(AvailabilitySnapshot.catalog_item_id == catalog_item_id)
        .where(AvailabilitySnapshot.format == a.format.value)
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if existing:
        existing.status = a.status.value
        existing.copies_available = a.copies_available
        existing.copies_total = a.copies_total
        existing.holds = a.holds
        existing.deep_link = a.deep_link
        existing.last_checked_at = now
        return existing

    row = AvailabilitySnapshot(
        user_id=user_id,
        catalog_item_id=catalog_item_id,
        format=a.format.value,
        status=a.status.value,
        copies_available=a.copies_available,
        copies_total=a.copies_total,
        holds=a.holds,
        deep_link=a.deep_link,
        last_checked_at=now,
    )
    db.add(row)
    return row
