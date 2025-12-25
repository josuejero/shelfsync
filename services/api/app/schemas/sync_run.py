from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class StartSyncRunIn(BaseModel):
    kind: str


class SyncRunOut(BaseModel):
    id: str
    kind: str
    status: str
    progress_current: int
    progress_total: int
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SyncRunEvent(BaseModel):
    run_id: str
    type: str
    payload: dict
    ts: datetime
