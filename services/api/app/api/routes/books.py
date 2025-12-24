from __future__ import annotations

from datetime import datetime, timezone

from app.api.deps import get_current_user
from app.api.rate_limit import rate_limiter
from app.core.config import settings
from app.db.session import get_db
from app.models.availability_snapshot import AvailabilitySnapshot
from app.models.catalog_item import CatalogItem
from app.models.catalog_match import CatalogMatch
from app.models.shelf_item import ShelfItem
from app.models.shelf_source import ShelfSource
from app.models.user_settings import UserSettings
from app.schemas.matching import CatalogItemOut
from app.services.availability_cache import get_availability_cached
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["books"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@router.get(
    "/books/{shelf_item_id}",
    dependencies=[
        Depends(
            rate_limiter(
                scope="books",
                limit=settings.rate_limit_books_per_window,
                window_seconds=settings.rate_limit_window_secs,
            )
        )
    ],
)
def get_book_detail(
    shelf_item_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    s = db.get(UserSettings, user.id)
    if not s:
        raise HTTPException(status_code=404, detail="Settings not found")

    it = (
        db.query(ShelfItem)
        .filter(ShelfItem.user_id == user.id)
        .filter(ShelfItem.id == shelf_item_id)
        .first()
    )
    if not it:
        raise HTTPException(status_code=404, detail="Shelf item not found")

    source = None
    if it.shelf_source_id:
        source = db.get(ShelfSource, it.shelf_source_id)

    cm = (
        db.query(CatalogMatch)
        .filter(CatalogMatch.user_id == user.id)
        .filter(CatalogMatch.shelf_item_id == it.id)
        .first()
    )

    ci = db.get(CatalogItem, cm.catalog_item_id) if cm else None

    formats = s.preferred_formats or ["ebook"]
    library_system = s.library_system

    # Ensure availability snapshots are present / fresh
    avail_out = []

    if ci and library_system:
        now = _now_utc()
        stale_cutoff = now.timestamp() - float(settings.availability_cache_ttl_secs)

        snaps = (
            db.query(AvailabilitySnapshot)
            .filter(AvailabilitySnapshot.user_id == user.id)
            .filter(AvailabilitySnapshot.catalog_item_id == ci.id)
            .filter(AvailabilitySnapshot.format.in_(formats))
            .all()
        )
        snap_by_fmt = {s.format: s for s in snaps}

        needs_refresh = False
        for fmt in formats:
            snap = snap_by_fmt.get(fmt)
            if not snap or snap.last_checked_at.timestamp() < stale_cutoff:
                needs_refresh = True

        if needs_refresh:
            cached = get_availability_cached(
                library_system=library_system,
                provider_item_ids=[ci.provider_item_id],
                formats=formats,
            )

            for (_pid, fmt), entry in cached.items():
                snap = snap_by_fmt.get(fmt)
                if not snap:
                    snap = AvailabilitySnapshot(
                        user_id=user.id,
                        catalog_item_id=ci.id,
                        format=fmt,
                        status=str(entry.availability.status),
                        copies_available=entry.availability.copies_available,
                        copies_total=entry.availability.copies_total,
                        holds=entry.availability.holds,
                        deep_link=entry.availability.deep_link,
                        last_checked_at=entry.last_checked_at,
                    )
                    db.add(snap)
                    snap_by_fmt[fmt] = snap
                else:
                    snap.status = str(entry.availability.status)
                    snap.copies_available = entry.availability.copies_available
                    snap.copies_total = entry.availability.copies_total
                    snap.holds = entry.availability.holds
                    snap.deep_link = entry.availability.deep_link
                    snap.last_checked_at = entry.last_checked_at

            db.commit()

        # Build output
        for fmt in formats:
            snap = snap_by_fmt.get(fmt)
            if not snap:
                continue
            avail_out.append(
                {
                    "format": snap.format,
                    "status": snap.status,
                    "copies_available": snap.copies_available,
                    "copies_total": snap.copies_total,
                    "holds": snap.holds,
                    "deep_link": snap.deep_link,
                    "last_checked_at": snap.last_checked_at,
                }
            )

    return {
        "shelf_item": {
            "id": it.id,
            "title": it.title,
            "author": it.author,
            "isbn10": it.isbn10,
            "isbn13": it.isbn13,
            "asin": it.asin,
            "shelf": it.shelf,
            "needs_fuzzy_match": it.needs_fuzzy_match,
            "created_at": it.created_at,
        },
        "source": {
            "source_type": source.source_type if source else None,
            "source_ref": source.source_ref if source else None,
            "last_synced_at": source.last_synced_at if source else None,
            "last_sync_status": source.last_sync_status if source else None,
            "last_sync_error": source.last_sync_error if source else None,
        },
        "match": (
            {
                "method": cm.method,
                "confidence": float(cm.confidence),
                "evidence": cm.evidence,
                "catalog_item": CatalogItemOut(
                    id=ci.id,
                    provider=ci.provider,
                    provider_item_id=ci.provider_item_id,
                    title=ci.title,
                    author=ci.author,
                    isbn10=ci.isbn10,
                    isbn13=ci.isbn13,
                    asin=ci.asin,
                ).model_dump(),
            }
            if (cm and ci)
            else None
        ),
        "availability": avail_out,
        "settings": {
            "library_system": s.library_system,
            "preferred_formats": s.preferred_formats,
            "updated_at": s.updated_at,
        },
    }
