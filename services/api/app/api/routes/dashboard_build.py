from datetime import datetime, timezone
from typing import Literal, Sequence

from app.models.shelf_item import ShelfItem
from app.models.shelf_source import ShelfSource
from app.models.user_settings import UserSettings
from app.schemas.dashboard import DashboardOut, LastSyncOut, PageOut
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.dashboard_queries import (
    build_rows,
    load_availability,
    load_catalog_items,
    load_matches,
    load_shelf_items,
    sort_rows,
)


def build_dashboard_out(
    *,
    db: Session,
    user,
    limit: int,
    offset: int,
    sort: Literal["read_next", "title", "updated"]
) -> DashboardOut:
    settings = _ensure_user_settings(db, user.id)
    preferred_formats = list(settings.preferred_formats or [])
    sources = _load_sources(db, user.id)
    source_ids = [s.id for s in sources]
    last_sync = _build_last_sync(sources)
    shelf_items = load_shelf_items(db, user.id, source_ids)

    if not shelf_items:
        return _empty_dashboard(settings, preferred_formats, last_sync, limit, offset)

    matches = load_matches(db, user.id, [si.id for si in shelf_items])
    catalog_by_id = load_catalog_items(db, matches)
    availability_map = load_availability(db, user.id, catalog_by_id)
    rows = build_rows(
        shelf_items, matches, catalog_by_id, availability_map, preferred_formats
    )
    sort_rows(rows, sort, shelf_items)
    total = len(rows)
    page_items = rows[offset : offset + limit]

    return DashboardOut(
        settings={
            "library_system": settings.library_system,
            "preferred_formats": preferred_formats,
            "updated_at": settings.updated_at,
        },
        last_sync=last_sync,
        page=PageOut(limit=limit, offset=offset, total=total),
        items=page_items,
    )


def _ensure_user_settings(db: Session, user_id: str) -> UserSettings:
    settings = db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    ).scalar_one_or_none()
    if settings is None:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _load_sources(db: Session, user_id: str) -> Sequence[ShelfSource]:
    return (
        db.execute(select(ShelfSource).where(ShelfSource.user_id == user_id))
        .scalars()
        .all()
    )


def _build_last_sync(sources: Sequence[ShelfSource]) -> LastSyncOut:
    if not sources:
        return LastSyncOut(
            source_type=None,
            source_id=None,
            last_synced_at=None,
            last_sync_status=None,
            last_sync_error=None,
        )

    min_dt = datetime.min.replace(tzinfo=timezone.utc)
    latest = max(sources, key=lambda s: s.last_synced_at or min_dt)
    return LastSyncOut(
        source_type=latest.source_type,
        source_id=latest.id,
        last_synced_at=latest.last_synced_at,
        last_sync_status=latest.last_sync_status,
        last_sync_error=latest.last_sync_error,
    )


def _empty_dashboard(
    settings: UserSettings,
    preferred_formats: list[str],
    last_sync: LastSyncOut,
    limit: int,
    offset: int,
) -> DashboardOut:
    return DashboardOut(
        settings={
            "library_system": settings.library_system,
            "preferred_formats": preferred_formats,
            "updated_at": settings.updated_at,
        },
        last_sync=last_sync,
        page=PageOut(limit=limit, offset=offset, total=0),
        items=[],
    )


def _ensure_user_settings(db: Session, user_id: str) -> UserSettings:
    settings = db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    ).scalar_one_or_none()
    if settings is None:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _load_sources(db: Session, user_id: str) -> Sequence[ShelfSource]:
    return (
        db.execute(select(ShelfSource).where(ShelfSource.user_id == user_id))
        .scalars()
        .all()
    )


def _build_last_sync(sources: Sequence[ShelfSource]) -> LastSyncOut:
    if not sources:
        return LastSyncOut(
            source_type=None,
            source_id=None,
            last_synced_at=None,
            last_sync_status=None,
            last_sync_error=None,
        )

    min_dt = datetime.min.replace(tzinfo=timezone.utc)
    latest = max(sources, key=lambda s: s.last_synced_at or min_dt)
    return LastSyncOut(
        source_type=latest.source_type,
        source_id=latest.id,
        last_synced_at=latest.last_synced_at,
        last_sync_status=latest.last_sync_status,
        last_sync_error=latest.last_sync_error,
    )


def _empty_dashboard(
    settings: UserSettings,
    preferred_formats: list[str],
    last_sync: LastSyncOut,
    limit: int,
    offset: int,
) -> DashboardOut:
    return DashboardOut(
        settings={
            "library_system": settings.library_system,
            "preferred_formats": preferred_formats,
            "updated_at": settings.updated_at,
        },
        last_sync=last_sync,
        page=PageOut(limit=limit, offset=offset, total=0),
        items=[],
    )
