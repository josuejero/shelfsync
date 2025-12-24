from __future__ import annotations

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.shelf_source import ShelfSource
from app.schemas.shelf import (
    ImportErrorOut,
    ImportSummaryOut,
    RssConnectIn,
    ShelfSourceOut,
)
from app.services.goodreads_csv import CsvImportError, parse_goodreads_csv
from app.services.goodreads_rss import normalize_rss_input_url
from app.services.shelf_import import ImportErrorItem, upsert_shelf_items
from app.workers.jobs import sync_goodreads_rss
from app.workers.queue import get_queue
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from rq import Retry
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/shelf-sources", tags=["shelf-sources"])


@router.post("/rss", response_model=ShelfSourceOut)
def connect_rss(
    payload: RssConnectIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    rss_url = (payload.rss_url or "").strip()
    if not rss_url:
        raise HTTPException(status_code=400, detail="RSS URL is required")

    try:
        url = normalize_rss_input_url(rss_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Upsert single active RSS source per user
    existing = db.execute(
        select(ShelfSource)
        .where(ShelfSource.user_id == user.id)
        .where(ShelfSource.provider == "goodreads")
        .where(ShelfSource.source_type == "rss")
    ).scalar_one_or_none()

    if existing:
        existing.source_ref = url
        existing.meta = {"shelf": payload.shelf}
        existing.is_active = True
        source = existing
    else:
        source = ShelfSource(
            user_id=user.id,
            source_type="rss",
            provider="goodreads",
            source_ref=url,
            meta={"shelf": payload.shelf},
            is_active=True,
        )
        db.add(source)

    db.commit()
    db.refresh(source)

    if payload.sync_now:
        q = get_queue()
        q.enqueue(sync_goodreads_rss, source.id, retry=Retry(max=3, interval=[10, 30, 60]))

    return source


@router.post("/csv", response_model=ImportSummaryOut)
def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    filename = (file.filename or "").lower()
    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=400, detail="Please upload a .csv file exported from Goodreads."
        )

    content = file.file.read()

    try:
        rows, row_errors = parse_goodreads_csv(content)
    except CsvImportError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # One logical CSV source per user
    source = db.execute(
        select(ShelfSource)
        .where(ShelfSource.user_id == user.id)
        .where(ShelfSource.provider == "goodreads")
        .where(ShelfSource.source_type == "csv")
    ).scalar_one_or_none()

    if not source:
        source = ShelfSource(
            user_id=user.id,
            source_type="csv",
            provider="goodreads",
            source_ref="goodreads-export.csv",
            meta={},
            is_active=True,
        )
        db.add(source)
        db.commit()
        db.refresh(source)

    summary = upsert_shelf_items(db, user_id=user.id, source=source, items=rows)

    # Merge row-level errors into summary
    for err in row_errors:
        summary.errors.append(ImportErrorItem(key=f"line:{err['line']}", error=err["error"]))

    return ImportSummaryOut(
        created=summary.created,
        updated=summary.updated,
        skipped=summary.skipped,
        errors=[ImportErrorOut(key=e.key, error=e.error) for e in summary.errors],
    )


@router.post("/{source_id}/sync")
def sync_source(
    source_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    source = db.execute(select(ShelfSource).where(ShelfSource.id == source_id)).scalar_one_or_none()
    if not source or source.user_id != user.id:
        raise HTTPException(status_code=404, detail="Shelf source not found")
    if source.source_type != "rss":
        raise HTTPException(status_code=400, detail="Only RSS sources can be synced")

    q = get_queue()
    job = q.enqueue(sync_goodreads_rss, source.id, retry=Retry(max=3, interval=[10, 30, 60]))
    return {"job_id": job.id}


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_source(
    source_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    source = db.execute(select(ShelfSource).where(ShelfSource.id == source_id)).scalar_one_or_none()
    if not source or source.user_id != user.id:
        raise HTTPException(status_code=404, detail="Shelf source not found")
    db.delete(source)
    db.commit()
    return None
