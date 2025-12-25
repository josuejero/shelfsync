from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Literal

from app.api.deps import get_current_user
from app.api.rate_limit import rate_limiter
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
    ReadNextOut,
)
from app.services.read_next_scoring import compute_read_next
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["dashboard"])


@router.get(
    "/dashboard",
    response_model=DashboardOut,
    dependencies=[Depends(rate_limiter("dashboard", limit=120, window_seconds=60))],
)
def get_dashboard(
    *,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    sort: Literal["read_next", "title", "updated"] = Query(default="read_next"),
) -> DashboardOut:
    # Settings
    user_settings = db.execute(
        select(UserSettings).where(UserSettings.user_id == user.id)
    ).scalar_one_or_none()
    if user_settings is None:
        user_settings = UserSettings(user_id=user.id)
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)

    preferred_formats = list(user_settings.preferred_formats or [])

    # Sources (used for last_sync and to keep dashboard scoped to user sources)
    sources = (
        db.execute(select(ShelfSource).where(ShelfSource.user_id == user.id))
        .scalars()
        .all()
    )
    source_ids = [s.id for s in sources]

    # Last sync (best effort)
    min_dt = datetime.min.replace(tzinfo=timezone.utc)
    latest_src = (
        max(sources, key=lambda s: s.last_synced_at or min_dt) if sources else None
    )
    last_sync = LastSyncOut(
        source_type=latest_src.source_type if latest_src else None,
        source_id=latest_src.id if latest_src else None,
        last_synced_at=latest_src.last_synced_at if latest_src else None,
        last_sync_status=latest_src.last_sync_status if latest_src else None,
        last_sync_error=latest_src.last_sync_error if latest_src else None,
    )

    # Load shelf items
    items_stmt = select(ShelfItem).where(ShelfItem.user_id == user.id)
    if source_ids:
        items_stmt = items_stmt.where(ShelfItem.shelf_source_id.in_(source_ids))

    all_items = db.execute(items_stmt).scalars().all()

    if not all_items:
        return DashboardOut(
            settings={
                "library_system": user_settings.library_system,
                "preferred_formats": preferred_formats,
                "updated_at": user_settings.updated_at,
            },
            last_sync=last_sync,
            page=PageOut(limit=limit, offset=offset, total=0),
            items=[],
        )

    # Load catalog matches (at most one per shelf item by constraint)
    shelf_item_ids = [i.id for i in all_items]
    matches = (
        db.execute(
            select(CatalogMatch).where(
                CatalogMatch.user_id == user.id,
                CatalogMatch.shelf_item_id.in_(shelf_item_ids),
            )
        )
        .scalars()
        .all()
    )
    match_by_shelf_id: dict[str, CatalogMatch] = {m.shelf_item_id: m for m in matches}

    # Load catalog items referenced by matches
    catalog_item_ids = {m.catalog_item_id for m in matches}
    catalog_items = (
        db.execute(
            select(CatalogItem).where(CatalogItem.id.in_(list(catalog_item_ids)))
        )
        .scalars()
        .all()
        if catalog_item_ids
        else []
    )
    catalog_by_id: dict[str, CatalogItem] = {c.id: c for c in catalog_items}

    # Load availability snapshots for those catalog items (grouped by catalog_item_id)
    snapshots = (
        db.execute(
            select(AvailabilitySnapshot).where(
                AvailabilitySnapshot.user_id == user.id,
                AvailabilitySnapshot.catalog_item_id.in_(list(catalog_item_ids)),
            )
        )
        .scalars()
        .all()
        if catalog_item_ids
        else []
    )
    snaps_by_catalog_id: dict[str, list[AvailabilitySnapshot]] = {}
    for s in snapshots:
        snaps_by_catalog_id.setdefault(s.catalog_item_id, []).append(s)

    rows: list[DashboardRowOut] = []
    for si in all_items:
        m = match_by_shelf_id.get(si.id)

        match_out: MatchMiniOut | None = None
        availability: list[AvailabilityOut] = []

        if m is not None:
            c = catalog_by_id.get(m.catalog_item_id)
            if c is not None:
                match_out = MatchMiniOut(
                    catalog_item_id=c.id,
                    provider=m.provider,
                    provider_item_id=c.provider_item_id,
                    method=m.method,
                    confidence=m.confidence,
                )

                for a in snaps_by_catalog_id.get(c.id, []):
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

        rows.append(
            DashboardRowOut(
                shelf_item_id=si.id,
                title=si.title,
                author=si.author,
                shelf=si.shelf,
                needs_fuzzy_match=si.needs_fuzzy_match,
                match=match_out,
                availability=availability,
                read_next=ReadNextOut(**asdict(rn)),
            )
        )

    # Sorting
    if sort == "read_next":
        rows.sort(key=lambda r: r.read_next.score, reverse=True)
    elif sort == "title":
        rows.sort(key=lambda r: (r.title or "").lower())
    elif sort == "updated":
        id_to_updated = {si.id: si.updated_at for si in all_items}
        rows.sort(
            key=lambda r: id_to_updated.get(r.shelf_item_id)
            or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

    total = len(rows)
    page_items = rows[offset : offset + limit]

    return DashboardOut(
        settings={
            "library_system": user_settings.library_system,
            "preferred_formats": preferred_formats,
            "updated_at": user_settings.updated_at,
        },
        last_sync=last_sync,
        page=PageOut(limit=limit, offset=offset, total=total),
        items=page_items,
    )
