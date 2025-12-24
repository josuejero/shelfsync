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
from app.schemas.dashboard import (
    AvailabilityOut,
    DashboardOut,
    DashboardRowOut,
    LastSyncOut,
    MatchMiniOut,
    PageOut,
)
from app.services.availability_cache import get_availability_cached
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["dashboard"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@router.get(
    "/dashboard",
    response_model=DashboardOut,
    dependencies=[
        Depends(
            rate_limiter(
                scope="dashboard",
                limit=settings.rate_limit_dashboard_per_window,
                window_seconds=settings.rate_limit_window_secs,
            )
        )
    ],
)
def get_dashboard(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    # Settings
    s = db.get(UserSettings, user.id)
    if not s:
        raise HTTPException(status_code=404, detail="Settings not found")

    formats = s.preferred_formats or ["ebook"]
    library_system = s.library_system

    # Last sync — pick most recently updated active source
    source = (
        db.query(ShelfSource)
        .filter(ShelfSource.user_id == user.id)
        .filter(ShelfSource.is_active.is_(True))
        .order_by(ShelfSource.updated_at.desc())
        .first()
    )

    last_sync = LastSyncOut(
        source_type=source.source_type if source else None,
        source_id=source.id if source else None,
        last_synced_at=source.last_synced_at if source else None,
        last_sync_status=source.last_sync_status if source else None,
        last_sync_error=source.last_sync_error if source else None,
    )

    q = db.query(ShelfItem).filter(ShelfItem.user_id == user.id)
    total = q.count()

    items = q.order_by(ShelfItem.title.asc()).offset(offset).limit(limit).all()
    shelf_item_ids = [it.id for it in items]

    # Matches + catalog items
    match_rows = (
        db.query(CatalogMatch, CatalogItem)
        .join(CatalogItem, CatalogItem.id == CatalogMatch.catalog_item_id)
        .filter(CatalogMatch.user_id == user.id)
        .filter(CatalogMatch.shelf_item_id.in_(shelf_item_ids))
        .all()
    )

    match_by_shelf: dict[str, tuple[CatalogMatch, CatalogItem]] = {
        cm.shelf_item_id: (cm, ci) for cm, ci in match_rows
    }

    # Availability snapshots already in DB
    catalog_items = [ci for _, ci in match_rows]
    catalog_item_ids = [ci.id for ci in catalog_items]

    snapshots = []
    if catalog_item_ids:
        snapshots = (
            db.query(AvailabilitySnapshot)
            .filter(AvailabilitySnapshot.user_id == user.id)
            .filter(AvailabilitySnapshot.catalog_item_id.in_(catalog_item_ids))
            .filter(AvailabilitySnapshot.format.in_(formats))
            .all()
        )

    snap_by_key = {(s.catalog_item_id, s.format): s for s in snapshots}

    # Refresh stale/missing snapshots when library is selected
    now = _now_utc()
    stale_cutoff = now.timestamp() - float(settings.availability_cache_ttl_secs)

    to_refresh_provider_item_ids: set[str] = set()
    provider_item_to_catalog: dict[str, str] = {}

    for _cm, ci in match_rows:
        provider_item_to_catalog[ci.provider_item_id] = ci.id
        for fmt in formats:
            snap = snap_by_key.get((ci.id, fmt))
            if not snap:
                to_refresh_provider_item_ids.add(ci.provider_item_id)
                continue
            if snap.last_checked_at.timestamp() < stale_cutoff:
                to_refresh_provider_item_ids.add(ci.provider_item_id)

    if library_system and to_refresh_provider_item_ids:
        cached = get_availability_cached(
            library_system=library_system,
            provider_item_ids=sorted(to_refresh_provider_item_ids),
            formats=formats,
        )

        # Upsert snapshots in one pass
        for (provider_item_id, fmt), entry in cached.items():
            catalog_item_id = provider_item_to_catalog.get(provider_item_id)
            if not catalog_item_id:
                continue

            snap = snap_by_key.get((catalog_item_id, fmt))
            if not snap:
                snap = AvailabilitySnapshot(
                    user_id=user.id,
                    catalog_item_id=catalog_item_id,
                    format=fmt,
                    status=str(entry.availability.status),
                    copies_available=entry.availability.copies_available,
                    copies_total=entry.availability.copies_total,
                    holds=entry.availability.holds,
                    deep_link=entry.availability.deep_link,
                    last_checked_at=entry.last_checked_at,
                )
                db.add(snap)
                snap_by_key[(catalog_item_id, fmt)] = snap
            else:
                snap.status = str(entry.availability.status)
                snap.copies_available = entry.availability.copies_available
                snap.copies_total = entry.availability.copies_total
                snap.holds = entry.availability.holds
                snap.deep_link = entry.availability.deep_link
                snap.last_checked_at = entry.last_checked_at

        db.commit()

    # Build response
    out_items: list[DashboardRowOut] = []

    for it in items:
        match = None
        availability: list[AvailabilityOut] = []

        pair = match_by_shelf.get(it.id)
        if pair:
            cm, ci = pair
            match = MatchMiniOut(
                catalog_item_id=ci.id,
                provider=ci.provider,
                provider_item_id=ci.provider_item_id,
                method=cm.method,
                confidence=float(cm.confidence),
            )

            for fmt in formats:
                snap = snap_by_key.get((ci.id, fmt))
                if not snap:
                    continue
                availability.append(
                    AvailabilityOut(
                        format=snap.format,
                        status=snap.status,
                        copies_available=snap.copies_available,
                        copies_total=snap.copies_total,
                        holds=snap.holds,
                        deep_link=snap.deep_link,
                        last_checked_at=snap.last_checked_at,
                    )
                )

        out_items.append(
            DashboardRowOut(
                shelf_item_id=it.id,
                title=it.title,
                author=it.author,
                shelf=it.shelf,
                needs_fuzzy_match=it.needs_fuzzy_match,
                match=match,
                availability=availability,
            )
        )

    return {
        "settings": {
            "library_system": s.library_system,
            "preferred_formats": s.preferred_formats,
            "updated_at": s.updated_at,
        },
        "last_sync": last_sync,
        "page": PageOut(limit=limit, offset=offset, total=total),
        "items": out_items,
    }
