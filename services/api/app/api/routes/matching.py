from __future__ import annotations

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.availability_snapshot import AvailabilitySnapshot
from app.models.catalog_item import CatalogItem
from app.models.catalog_match import CatalogMatch
from app.models.shelf_item import ShelfItem
from app.schemas.matching import (
    AvailabilityOut,
    CatalogItemOut,
    JobStatusOut,
    MatchOut,
    RefreshEnqueuedOut,
)
from app.workers.jobs import refresh_matching_for_user
from app.workers.queue import get_queue
from app.workers.redis_conn import get_redis_connection
from fastapi import APIRouter, Depends, HTTPException
from rq import Retry
from rq.job import Job
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["matching"])


@router.post("/matching/refresh", response_model=RefreshEnqueuedOut)
def refresh_matching(user=Depends(get_current_user)):
    q = get_queue()
    job = q.enqueue(refresh_matching_for_user, user.id, retry=Retry(max=2, interval=[5, 15]))
    return {"job_id": job.id}


@router.get("/matching/refresh/{job_id}", response_model=JobStatusOut)
def refresh_status(job_id: str, user=Depends(get_current_user)):
    # user param enforces auth; job is keyed only by id
    try:
        conn = get_redis_connection()
        job = Job.fetch(job_id, connection=conn)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Job not found: {e}")

    return JobStatusOut(
        id=job.id,
        status=job.get_status(),
        created_at=job.created_at,
        started_at=job.started_at,
        ended_at=job.ended_at,
        result=job.result if isinstance(job.result, dict) else None,
        exc_info=job.exc_info,
    )


@router.get("/matches", response_model=list[MatchOut])
def list_matches(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    limit: int = 50,
    offset: int = 0,
):
    # Join: shelf_items → catalog_matches → catalog_items, then attach availability snapshots
    rows = db.execute(
        select(ShelfItem, CatalogMatch, CatalogItem)
        .join(CatalogMatch, CatalogMatch.shelf_item_id == ShelfItem.id)
        .join(CatalogItem, CatalogItem.id == CatalogMatch.catalog_item_id)
        .where(ShelfItem.user_id == user.id)
        .order_by(ShelfItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    catalog_ids = [ci.id for _, _, ci in rows]
    av_rows = (
        db.execute(
            select(AvailabilitySnapshot)
            .where(AvailabilitySnapshot.user_id == user.id)
            .where(AvailabilitySnapshot.catalog_item_id.in_(catalog_ids))
        )
        .scalars()
        .all()
    )
    avail_by_catalog: dict[str, list[AvailabilitySnapshot]] = {}
    for a in av_rows:
        avail_by_catalog.setdefault(a.catalog_item_id, []).append(a)

    out: list[MatchOut] = []
    for si, m, ci in rows:
        av_out = [
            AvailabilityOut(
                format=a.format,
                status=a.status,
                copies_available=a.copies_available,
                copies_total=a.copies_total,
                holds=a.holds,
                deep_link=a.deep_link,
                last_checked_at=a.last_checked_at,
            )
            for a in sorted(avail_by_catalog.get(ci.id, []), key=lambda x: x.format)
        ]

        out.append(
            MatchOut(
                shelf_item_id=si.id,
                catalog_item=CatalogItemOut(
                    id=ci.id,
                    provider=ci.provider,
                    provider_item_id=ci.provider_item_id,
                    title=ci.title,
                    author=ci.author,
                    isbn10=ci.isbn10,
                    isbn13=ci.isbn13,
                    asin=ci.asin,
                ),
                method=m.method,
                confidence=m.confidence,
                evidence=m.evidence,
                availability=av_out,
            )
        )

    return out


@router.get("/matches/{shelf_item_id}", response_model=MatchOut)
def get_match(
    shelf_item_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    row = db.execute(
        select(ShelfItem, CatalogMatch, CatalogItem)
        .join(CatalogMatch, CatalogMatch.shelf_item_id == ShelfItem.id)
        .join(CatalogItem, CatalogItem.id == CatalogMatch.catalog_item_id)
        .where(ShelfItem.user_id == user.id)
        .where(ShelfItem.id == shelf_item_id)
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Match not found")

    si, m, ci = row
    av = (
        db.execute(
            select(AvailabilitySnapshot)
            .where(AvailabilitySnapshot.user_id == user.id)
            .where(AvailabilitySnapshot.catalog_item_id == ci.id)
        )
        .scalars()
        .all()
    )

    return MatchOut(
        shelf_item_id=si.id,
        catalog_item=CatalogItemOut(
            id=ci.id,
            provider=ci.provider,
            provider_item_id=ci.provider_item_id,
            title=ci.title,
            author=ci.author,
            isbn10=ci.isbn10,
            isbn13=ci.isbn13,
            asin=ci.asin,
        ),
        method=m.method,
        confidence=m.confidence,
        evidence=m.evidence,
        availability=[
            AvailabilityOut(
                format=a.format,
                status=a.status,
                copies_available=a.copies_available,
                copies_total=a.copies_total,
                holds=a.holds,
                deep_link=a.deep_link,
                last_checked_at=a.last_checked_at,
            )
            for a in sorted(av, key=lambda x: x.format)
        ],
    )
