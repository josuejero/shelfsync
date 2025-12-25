from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.redis import get_redis_async
from app.core.security import hash_password
from app.crud.sync_runs import create_sync_run, get_sync_run
from app.db.session import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.sync_run import StartSyncRunIn, SyncRunOut
from app.workers.queue import enqueue_availability_refresh
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["sync-runs"])


def _get_or_create_demo_user(db: Session) -> User:
    demo_email = "demo@example.com"
    u = db.execute(select(User).where(User.email == demo_email)).scalar_one_or_none()
    if u is not None:
        return u

    u = User(email=demo_email, password_hash=hash_password("password"))
    db.add(u)
    db.flush()
    db.add(UserSettings(user_id=u.id))
    db.commit()
    db.refresh(u)
    return u


def _optional_user(request: Request, db: Session) -> User | None:
    try:
        return get_current_user(request=request, db=db)
    except HTTPException:
        return None


@router.post("/sync-runs", response_model=SyncRunOut)
def start_sync_run(
    payload: StartSyncRunIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    # Optional auth (test hits this endpoint without cookies)
    user = _optional_user(request, db)

    if user is None:
        if not (
            settings.demo_login_enabled
            and settings.env in {"local", "development", "dev"}
        ):
            raise HTTPException(status_code=401, detail="Not authenticated")
        user = _get_or_create_demo_user(db)

    run = create_sync_run(db, user_id=user.id, kind=payload.kind)
    enqueue_availability_refresh(sync_run_id=run.id)
    return run


@router.get("/sync-runs/{run_id}", response_model=SyncRunOut)
def get_sync_run_detail(
    run_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    run = get_sync_run(db, run_id=run_id)
    if run is None or run.user_id != user.id:
        raise HTTPException(status_code=404, detail="Sync run not found")
    return run


@router.get("/sync-runs/{run_id}/events")
async def stream_sync_events(
    run_id: str,
    user=Depends(get_current_user),
) -> StreamingResponse:
    redis_client = get_redis_async(settings.redis_url)

    channel = f"sync:{user.id}:{run_id}"

    async def event_generator() -> AsyncGenerator[str, None]:
        pubsub = redis_client.pubsub()
        await pubsub.subscribe(channel)

        try:
            async for message in pubsub.listen():
                if message is None:
                    continue
                if message.get("type") != "message":
                    continue

                data_raw = message.get("data")
                if data_raw is None:
                    continue

                if isinstance(data_raw, (bytes, bytearray)):
                    data_str = data_raw.decode("utf-8")
                else:
                    data_str = str(data_raw)

                payload = json.loads(data_str)
                payload.setdefault("ts", datetime.now(timezone.utc).isoformat())
                payload["run_id"] = run_id

                yield f"data: {json.dumps(payload)}\n\n"
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
