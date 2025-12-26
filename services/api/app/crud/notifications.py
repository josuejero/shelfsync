from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, cast

from app.models.notification_event import NotificationEvent
from app.models.shelf_item import ShelfItem
from sqlalchemy import func, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class NotificationRow:
    event: NotificationEvent
    title: str
    author: str | None


def unread_count(db: Session, *, user_id: str) -> int:
    """Count unread notifications for a user.

    Kept for compatibility with app.api.routes.notifications imports.
    """
    return int(
        db.execute(
            select(func.count())
            .select_from(NotificationEvent)
            .where(
                NotificationEvent.user_id == user_id,
                NotificationEvent.read_at.is_(None),
            )
        ).scalar_one()
    )


# Backwards/forwards compatibility if other code used a different name.
count_unread = unread_count


def list_notifications(
    db: Session,
    *,
    user_id: str,
    unread_only: bool,
    limit: int,
    offset: int,
) -> tuple[int, list[NotificationRow]]:
    base = (
        select(NotificationEvent, ShelfItem.title, ShelfItem.author)
        .join(ShelfItem, ShelfItem.id == NotificationEvent.shelf_item_id)
        .where(NotificationEvent.user_id == user_id)
    )
    if unread_only:
        base = base.where(NotificationEvent.read_at.is_(None))

    total = int(
        db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    )

    stmt = (
        base.order_by(NotificationEvent.created_at.desc()).limit(limit).offset(offset)
    )

    # .tuples() gives mypy a predictable tuple type for unpacking
    rows_raw = db.execute(stmt).tuples().all()

    rows: list[NotificationRow] = []
    for ev, title, author in rows_raw:
        rows.append(NotificationRow(event=ev, title=title, author=author))

    return total, rows


def mark_read(db: Session, *, user_id: str, notification_id: str) -> bool:
    """Mark a single notification as read (idempotent)."""
    ev = db.get(NotificationEvent, notification_id)
    if ev is None or ev.user_id != user_id:
        return False

    if ev.read_at is None:
        ev.read_at = utcnow()
        db.add(ev)
        db.commit()

    return True


def mark_all_read(db: Session, *, user_id: str) -> int:
    now = utcnow()
    stmt = (
        update(NotificationEvent)
        .where(
            NotificationEvent.user_id == user_id, NotificationEvent.read_at.is_(None)
        )
        .values(read_at=now)
    )
    res = cast(CursorResult[Any], db.execute(stmt))
    db.commit()
    return int(res.rowcount or 0)
