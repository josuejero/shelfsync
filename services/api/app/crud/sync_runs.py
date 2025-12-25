from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.models.sync_run import SyncRun
from sqlalchemy.orm import Session


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_sync_run(db: Session, *, user_id: str, kind: str) -> SyncRun:
    run = SyncRun(
        user_id=user_id,
        kind=kind,
        status="queued",
        progress_current=0,
        progress_total=0,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def set_sync_run_running(db: Session, *, run: SyncRun, total: int) -> SyncRun:
    run.status = "running"
    run.started_at = _utcnow()
    run.progress_total = total
    run.progress_current = 0
    db.commit()
    db.refresh(run)
    return run


def update_progress(
    db: Session, *, run: SyncRun, current: int, total: Optional[int] = None
) -> SyncRun:
    run.progress_current = current
    if total is not None:
        run.progress_total = total
    db.commit()
    db.refresh(run)
    return run


def set_sync_run_failed(db: Session, *, run: SyncRun, message: str) -> SyncRun:
    run.status = "failed"
    run.error_message = message
    run.finished_at = _utcnow()
    db.commit()
    db.refresh(run)
    return run


def set_sync_run_succeeded(db: Session, *, run: SyncRun) -> SyncRun:
    run.status = "succeeded"
    run.finished_at = _utcnow()
    db.commit()
    db.refresh(run)
    return run


def get_sync_run(db: Session, *, run_id: str) -> Optional[SyncRun]:
    return db.query(SyncRun).filter(SyncRun.id == run_id).first()


def latest_sync_run_for_user(
    db: Session, *, user_id: str, kind: str = "availability_refresh"
) -> Optional[SyncRun]:
    return (
        db.query(SyncRun)
        .filter(SyncRun.user_id == user_id, SyncRun.kind == kind)
        .order_by(SyncRun.created_at.desc())
        .first()
    )
