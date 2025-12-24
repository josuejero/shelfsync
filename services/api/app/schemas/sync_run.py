from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class SyncRunOut(BaseModel):
    id: UUID
    kind: str
    status: str
    progress_current: int
    progress_total: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SyncRunCreateIn(BaseModel):
    kind: str = "availability_refresh"


class SyncRunEvent(BaseModel):
    # SSE event payload
    type: str
    run_id: UUID
    ts: datetime
    payload: dict
