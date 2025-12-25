from __future__ import annotations

from dataclasses import asdict
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
from app.schemas.books import (
    BookDetailMatchOut,
    BookDetailOut,
    BookDetailSettingsOut,
    BookDetailShelfItemOut,
    BookDetailSourceOut,
)
from app.schemas.dashboard import AvailabilityOut, ReadNextOut
from app.services.read_next_scoring import compute_read_next
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["books"])


@router.get(
    "/books/{shelf_item_id}",
    response_model=BookDetailOut,
    dependencies=[
        Depends(
            rate_limiter(
                "book_detail",
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
    si = db.get(ShelfItem, shelf_item_id)
    if si is None or si.user_id != user.id:
        raise HTTPException(status_code=404, detail="Book not found")

    user_settings = db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    ).scalar_one_or_none()
    if user_settings is None:
        user_settings = UserSettings(user_id=user.id)
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)

    preferred_formats = list(user_settings.preferred_formats or [])

    m = (
        db.execute(
            select(CatalogMatch)
            .where(CatalogMatch.user_id == user.id)
            .where(CatalogMatch.shelf_item_id == si.id)
            .order_by(CatalogMatch.confidence.desc())
        )
        .scalars()
        .first()
    )

    availability: list[AvailabilityOut] = []
    match_out: BookDetailMatchOut | None = None

    if m is not None:
        ci = db.get(CatalogItem, m.catalog_item_id)

        if ci is not None:
            match_out = BookDetailMatchOut(
                catalog_item_id=m.catalog_item_id,
                provider=m.provider,
                provider_item_id=ci.provider_item_id,
                method=m.method,
                confidence=float(m.confidence or 0.0),
            )

        snaps = (
            db.execute(
                select(AvailabilitySnapshot)
                .where(AvailabilitySnapshot.user_id == user.id)
                .where(AvailabilitySnapshot.catalog_item_id == m.catalog_item_id)
            )
            .scalars()
            .all()
        )

        def _sort_key(a: AvailabilitySnapshot) -> tuple[int, str]:
            if a.format in preferred_formats:
                return (preferred_formats.index(a.format), a.format)
            return (999, a.format)

        for a in sorted(snaps, key=_sort_key):
            availability.append(
                AvailabilityOut(
                    format=a.format,
                    status=a.status,
                    copies_available=a.copies_available,
                    copies_total=a.copies_total,
                    holds=a.holds,
                    deep_link=a.deep_link,
                    last_checked_at=a.last_checked_at,
                )
            )

    rn = compute_read_next(availability, preferred_formats)

    source_out: BookDetailSourceOut | None = None
    if si.shelf_source_id:
        src = db.get(ShelfSource, si.shelf_source_id)
        if src is not None:
            source_out = BookDetailSourceOut(
                id=src.id,
                source_type=src.source_type,
                provider=src.provider,
                source_ref=src.source_ref,
                last_synced_at=src.last_synced_at,
                last_sync_status=src.last_sync_status,
                last_sync_error=src.last_sync_error,
            )

    return BookDetailOut(
        shelf_item=BookDetailShelfItemOut(
            id=si.id,
            title=si.title,
            author=si.author,
            isbn10=si.isbn10,
            isbn13=si.isbn13,
            asin=si.asin,
            shelf=si.shelf,
            needs_fuzzy_match=si.needs_fuzzy_match,
        ),
        match=match_out,
        availability=availability,
        source=source_out,
        settings=BookDetailSettingsOut(
            library_system=user_settings.library_system,
            preferred_formats=preferred_formats,
        ),
        read_next=ReadNextOut(**asdict(rn)),
        generated_at=datetime.now(timezone.utc),
    )
