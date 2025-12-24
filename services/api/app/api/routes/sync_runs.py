from __future__ import annotations

import json
import time
from datetime import datetime
from typing import Iterator
from uuid import UUID

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.redis import get_redis_async
from app.crud.sync_runs import create_sync_run, get_sync_run
from app.schemas.sync_run import SyncRunCreateIn, SyncRunOut
from app.workers.queue import enqueue_availability_refresh
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

router = APIRouter(prefix="/sync-runs", tags=["sync-runs"])


@router.post("", response_model=SyncRunOut)
def start_sync_run(
    payload: SyncRunCreateIn,
    db: Session = Depends("get_db"),
    user=Depends(get_current_user),
):
    # For Phase 5 we only support availability_refresh.
    kind = payload.kind
    if kind != "availability_refresh":
        raise HTTPException(status_code=400, detail="Unsupported sync kind")

    run = create_sync_run(db, user_id=user.id, kind=kind)

    # Enqueue worker job.
    enqueue_availability_refresh(sync_run_id=run.id)

    return run


@router.get("/{run_id}", response_model=SyncRunOut)
def get_sync_run_status(
    run_id: UUID,
    db: Session = Depends("get_db"),
    user=Depends(get_current_user),
):
    run = get_sync_run(db, run_id=run_id)
    if not run or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return run


@router.get("/{run_id}/events")
async def stream_sync_run_events(
    run_id: UUID,
    request: Request,
    user=Depends(get_current_user),
):
    """Server-Sent Events stream for a specific sync run."""

    channel = f"sync:{user.id}:{run_id}"
    r = get_redis_async(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    async def event_iter() -> Iterator[bytes]:
        # Send an initial comment to establish the stream
        yield b": connected\n\n"
        last_heartbeat = time.time()

        try:
            while True:
                if await request.is_disconnected():
                    break

                # Heartbeat to keep proxies from buffering/closing.
                now = time.time()
                if now - last_heartbeat > 15:
                    yield b": keep-alive\n\n"
                    last_heartbeat = now

                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if not msg:
                    continue

                data = msg.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")

                # SSE format
                payload = {
                    "run_id": str(run_id),
                    "ts": datetime.utcnow().isoformat() + "Z",
                    **json.loads(data),
                }
                out = "event: sync\n" + "data: " + json.dumps(payload) + "\n\n"
                yield out.encode("utf-8")
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()
            await r.close()

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_iter(), media_type="text/event-stream", headers=headers)
