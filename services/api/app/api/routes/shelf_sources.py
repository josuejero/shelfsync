from __future__ import annotations

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.shelf_source import ShelfSource
from app.schemas.shelf import (
    ImportErrorOut,
    ImportSummaryOut,
    RssConnectIn,
    ShelfSourceOut,
    SyncEnqueuedOut,
)
from app.services.goodreads_csv import parse_goodreads_csv
from app.services.shelf_import import upsert_shelf_items
from app.workers.jobs import sync_goodreads_rss
from app.workers.queue import get_queue
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from rq import Retry
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1/shelf-sources", tags=["shelf-sources"])


@router.get("", response_model=list[ShelfSourceOut])
def list_sources(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return (
        db.execute(select(ShelfSource).where(ShelfSource.user_id == user.id))
        .scalars()
        .all()
    )


@router.post("/rss", response_model=ShelfSourceOut)
def connect_rss(
    payload: RssConnectIn, db: Session = Depends(get_db), user=Depends(get_current_user)
):
    existing = db.execute(
        select(ShelfSource)
        .where(ShelfSource.user_id == user.id)
        .where(ShelfSource.source_type == "rss")
        .where(ShelfSource.provider == "goodreads")
        .where(ShelfSource.source_ref == payload.rss_url)
    ).scalar_one_or_none()

    if existing is None:
        source = ShelfSource(
            user_id=user.id,
            source_type="rss",
            provider="goodreads",
            source_ref=payload.rss_url,
            meta={"shelf": payload.shelf} if payload.shelf else {},
            is_active=True,
        )
        db.add(source)
        db.commit()
        db.refresh(source)
    else:
        existing.meta = {
            **(existing.meta or {}),
            **({"shelf": payload.shelf} if payload.shelf else {}),
        }
        existing.is_active = True
        db.add(existing)
        db.commit()
        db.refresh(existing)
        source = existing

    if payload.sync_now:
        q = get_queue()
        q.enqueue(sync_goodreads_rss, source.id, retry=Retry(max=2, interval=[5, 15]))

    return source


@router.post("/csv", response_model=ImportSummaryOut)
def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    raw = file.file.read()

    rows, parse_errors = parse_goodreads_csv(raw)

    source = db.execute(
        select(ShelfSource)
        .where(ShelfSource.user_id == user.id)
        .where(ShelfSource.source_type == "csv")
        .where(ShelfSource.provider == "goodreads")
    ).scalar_one_or_none()
    if source is None:
        source = ShelfSource(
            user_id=user.id,
            source_type="csv",
            provider="goodreads",
            source_ref=file.filename or "upload",
            meta={},
            is_active=True,
        )
        db.add(source)
        db.commit()
        db.refresh(source)

    summary = upsert_shelf_items(db, user_id=user.id, source=source, items=rows)

    errors_out: list[ImportErrorOut] = [
        ImportErrorOut(key=e.key, error=e.error) for e in summary.errors
    ] + [
        ImportErrorOut(key=f"line:{e['line']}", error=e["error"]) for e in parse_errors
    ]

    return ImportSummaryOut(
        created=summary.created,
        updated=summary.updated,
        skipped=summary.skipped + len(parse_errors),
        errors=errors_out,
    )


@router.post("/{source_id}/sync", response_model=SyncEnqueuedOut)
def sync_source(
    source_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)
):
    source = db.get(ShelfSource, source_id)
    if source is None or source.user_id != user.id:
        raise HTTPException(status_code=404, detail="Source not found")

    if source.source_type != "rss":
        raise HTTPException(status_code=400, detail="Only RSS sources can be synced")

    q = get_queue()
    job = q.enqueue(sync_goodreads_rss, source.id, retry=Retry(max=2, interval=[5, 15]))
    return SyncEnqueuedOut(job_id=job.id)


@router.delete("/{source_id}", status_code=204)
def delete_source(
    source_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)
):
    source = db.get(ShelfSource, source_id)
    if source is None or source.user_id != user.id:
        raise HTTPException(status_code=404, detail="Source not found")
    db.delete(source)
    db.commit()
    return None
