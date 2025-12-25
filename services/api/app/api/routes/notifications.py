from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from app.api.deps import get_current_user
from app.api.rate_limit import rate_limiter
from app.core.config import settings
from app.core.redis import get_redis_async
from app.crud.notifications import list_notifications, mark_all_read, mark_read, unread_count
from app.db.session import get_db
from app.schemas.notifications import (
    NotificationListOut,
    NotificationOut,
    PageOut,
    UnreadCountOut,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["notifications"])


@router.get(
    "/notifications",
    response_model=NotificationListOut,
    dependencies=[Depends(rate_limiter("notifications", limit=120, window_seconds=60))],
)
def get_notifications(
    *,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    total, rows = list_notifications(
        db,
        user_id=user.id,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )

    items = [
        NotificationOut(
            id=r.event.id,
            created_at=r.event.created_at,
            read_at=r.event.read_at,
            shelf_item_id=r.event.shelf_item_id,
            title=r.title,
            author=r.author,
            format=r.event.format,
            old_status=r.event.old_status,
            new_status=r.event.new_status,
            deep_link=r.event.deep_link,
        )
        for r in rows
    ]

    return NotificationListOut(page=PageOut(limit=limit, offset=offset, total=total), items=items)


@router.get(
    "/notifications/unread-count",
    response_model=UnreadCountOut,
    dependencies=[Depends(rate_limiter("notifications_unread", limit=240, window_seconds=60))],
)
def get_unread_count(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    return UnreadCountOut(unread=unread_count(db, user_id=user.id))


@router.post(
    "/notifications/{notification_id}/read",
    status_code=204,
    dependencies=[Depends(rate_limiter("notifications_mark_read", limit=240, window_seconds=60))],
)
def mark_notification_read(
    notification_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ok = mark_read(db, user_id=user.id, notification_id=notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return None


@router.post(
    "/notifications/mark-all-read",
    dependencies=[Depends(rate_limiter("notifications_mark_all", limit=60, window_seconds=60))],
)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    n = mark_all_read(db, user_id=user.id)
    return {"updated": n}


@router.get("/notifications/events")
async def stream_notifications(
    user=Depends(get_current_user),
) -> StreamingResponse:
    redis_client = get_redis_async(settings.redis_url)
    channel = f"notify:{user.id}"

    async def event_generator() -> AsyncGenerator[str, None]:
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(channel)

        # Basic keepalive to help proxies (optional)
        last_keepalive = datetime.now(timezone.utc)

        try:
            async for message in pubsub.listen():
                now = datetime.now(timezone.utc)

                # Keepalive comment every ~25s
                if (now - last_keepalive).total_seconds() > 25:
                    yield ": keepalive\n\n"
                    last_keepalive = now

                if message is None:
                    continue
                if message.get("type") != "message":
                    continue

                data_raw = message.get("data")
                if isinstance(data_raw, (bytes, bytearray)):
                    data_str = data_raw.decode("utf-8")
                else:
                    data_str = str(data_raw)

                payload = json.loads(data_str)
                payload.setdefault("ts", now.isoformat())

                yield f"data: {json.dumps(payload)}\n\n"
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")