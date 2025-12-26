from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable
from uuid import uuid4

from app.models.availability_snapshot import AvailabilitySnapshot
from app.models.catalog_match import CatalogMatch
from app.models.notification_event import NotificationEvent
from app.models.user_settings import UserSettings
from app.providers.types import AvailabilityResult
from sqlalchemy import select
from sqlalchemy.orm import Session


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class NotificationCreated:
    id: str
    shelf_item_id: str
    title: str
    format: str


def upsert_snapshots(
    db: Session, *, user_id: str, results: Iterable[AvailabilityResult]
) -> list[NotificationCreated]:
    """Persist availability snapshots and create notifications when items become available.

    Notes:
    - Notification creation is durable (DB insert).
    - Real-time delivery (Redis/SSE) is best-effort and happens after commit.
    """

    # Read settings once per chunk
    s = db.get(UserSettings, user_id)
    notifications_on = bool(getattr(s, "notifications_enabled", True)) if s else True

    results_list = list(results)
    if not results_list:
        return []

    # Map catalog_item_id -> shelf_item_id for this user
    catalog_ids = {r.catalog_item_id for r in results_list}
    match_rows = db.execute(
        select(CatalogMatch.catalog_item_id, CatalogMatch.shelf_item_id).where(
            CatalogMatch.user_id == user_id,
            CatalogMatch.catalog_item_id.in_(list(catalog_ids)),
        )
    ).all()
    catalog_to_shelf = {cid: sid for cid, sid in match_rows}

    # Preload existing snapshots for quick compare
    existing_rows = (
        db.execute(
            select(AvailabilitySnapshot).where(
                AvailabilitySnapshot.user_id == user_id,
                AvailabilitySnapshot.catalog_item_id.in_(list(catalog_ids)),
            )
        )
        .scalars()
        .all()
    )
    existing_by_key: dict[tuple[str, str], AvailabilitySnapshot] = {
        (row.catalog_item_id, row.format): row for row in existing_rows
    }

    created: list[NotificationCreated] = []
    now = utcnow()

    for r in results_list:
        a = r.availability
        key = (r.catalog_item_id, a.format.value)

        prev = existing_by_key.get(key)
        old_status = prev.status if prev is not None else "unknown"
        new_status = a.status.value

        # Upsert snapshot
        if prev is not None:
            prev.status = new_status
            prev.copies_available = a.copies_available
            prev.copies_total = a.copies_total
            prev.holds = a.holds
            prev.deep_link = a.deep_link
            prev.last_checked_at = now
        else:
            row = AvailabilitySnapshot(
                id=str(uuid4()),
                user_id=user_id,
                catalog_item_id=r.catalog_item_id,
                format=a.format.value,
                status=new_status,
                copies_available=a.copies_available,
                copies_total=a.copies_total,
                holds=a.holds,
                deep_link=a.deep_link,
                last_checked_at=now,
            )
            db.add(row)
            existing_by_key[key] = row

        # Emit notification on transition -> available
        if (
            notifications_on
            and old_status in {"hold", "not_owned"}
            and new_status == "available"
        ):
            shelf_item_id = catalog_to_shelf.get(r.catalog_item_id)
            if shelf_item_id:
                ev = NotificationEvent(
                    id=str(uuid4()),
                    user_id=user_id,
                    shelf_item_id=shelf_item_id,
                    format=a.format.value,
                    old_status=old_status,
                    new_status=new_status,
                    deep_link=a.deep_link,
                    created_at=now,
                )
                db.add(ev)

                created.append(
                    NotificationCreated(
                        id=ev.id,
                        shelf_item_id=shelf_item_id,
                        title="",  # hydrated later (optional)
                        format=a.format.value,
                    )
                )

    return created
