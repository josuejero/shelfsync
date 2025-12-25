from __future__ import annotations

import asyncio
import inspect
import logging
from datetime import datetime, timezone

from app.crud.availability import upsert_snapshots
from app.crud.shelf_items import list_shelf_items_for_user
from app.crud.sync_runs import (
    get_sync_run,
    set_sync_run_failed,
    set_sync_run_running,
    set_sync_run_succeeded,
    update_progress,
)
from app.db.session import SessionLocal
from app.models.shelf_source import ShelfSource
from app.providers.factory import get_provider
from app.services.catalog.factory import get_provider as get_catalog_provider
from app.services.goodreads_rss import fetch_rss, parse_goodreads_rss
from app.services.matching.matcher import match_shelf_item
from app.services.matching.persist import upsert_catalog_item, upsert_match
from app.services.shelf_import import upsert_shelf_items
from app.workers.async_utils import run_async
from app.workers.events import publish_sync_event
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def availability_refresh_job(sync_run_id: str) -> None:
    db: Session = SessionLocal()
    run = None
    try:
        run = get_sync_run(db, run_id=sync_run_id)
        if run is None:
            raise RuntimeError("sync run not found")

        items = list_shelf_items_for_user(db, user_id=run.user_id)
        total = len(items)

        set_sync_run_running(db, run=run, total=total)

        provider = get_provider(db, run.user_id)

        processed = 0
        batch_size = 50

        for i in range(0, total, batch_size):
            chunk = items[i : i + batch_size]
            results = provider.availability_bulk(chunk)

            upsert_snapshots(db, user_id=run.user_id, results=results)
            processed += len(chunk)

            update_progress(db, run=run, current=processed)
            publish_sync_event(
                user_id=run.user_id,
                run_id=run.id,
                type_="availability_progress",
                payload={"current": processed, "total": total},
            )

        set_sync_run_succeeded(db, run=run)
        publish_sync_event(
            user_id=run.user_id, run_id=run.id, type_="availability_done", payload={}
        )

    except Exception as e:
        logger.exception("availability_refresh_job failed")
        try:
            if run is None:
                run = get_sync_run(db, run_id=sync_run_id)
            if run is not None:
                set_sync_run_failed(db, run=run, message=str(e))
                publish_sync_event(
                    user_id=run.user_id,
                    run_id=run.id,
                    type_="availability_failed",
                    payload={"error": str(e)},
                )
        except Exception:
            logger.exception("failed to mark sync run as failed")
        raise
    finally:
        db.close()


def refresh_matching_for_user(user_id: str) -> dict:
    """Refresh catalog matching for all of a user's shelf items.

    Returns a small dict that RQ can store as the job result.
    """
    db: Session = SessionLocal()
    try:
        provider = get_catalog_provider()
        items = list_shelf_items_for_user(db, user_id=user_id)

        processed = 0
        matched = 0

        for item in items:
            processed += 1
            res = run_async(match_shelf_item(provider, item))
            if res is None:
                continue

            catalog_item = upsert_catalog_item(db, res.book)
            db.flush()  # ensure catalog_item.id is available

            upsert_match(
                db,
                user_id=user_id,
                shelf_item_id=item.id,
                catalog_item_id=catalog_item.id,
                provider=catalog_item.provider,
                method=res.method,
                confidence=res.confidence,
                evidence=res.evidence,
            )

            item.needs_fuzzy_match = False
            matched += 1

            if processed % 50 == 0:
                db.commit()

        db.commit()
        return {"processed": processed, "matched": matched}
    except Exception:
        db.rollback()
        logger.exception("refresh_matching_for_user failed", extra={"user_id": user_id})
        raise
    finally:
        db.close()


def sync_goodreads_rss(source_id: str) -> None:
    """Fetch + parse Goodreads RSS and upsert shelf items for a ShelfSource."""
    db: Session = SessionLocal()
    try:
        source = db.get(ShelfSource, source_id)
        if source is None:
            logger.warning("shelf_source_not_found", extra={"source_id": source_id})
            return

        # Mark as running (best effort)
        if hasattr(source, "last_sync_status"):
            setattr(source, "last_sync_status", "running")
        if hasattr(source, "last_sync_started_at"):
            setattr(source, "last_sync_started_at", datetime.now(timezone.utc))
        db.commit()

        # Fetch RSS - fetch_rss is async in our service, but we run inside sync worker.
        rss_coro_or_text = fetch_rss(getattr(source, "source_ref", ""))
        if inspect.isawaitable(rss_coro_or_text):
            xml_text = asyncio.run(rss_coro_or_text)
        else:
            xml_text = rss_coro_or_text  # type: ignore[assignment]

        items = parse_goodreads_rss(
            xml_text, default_shelf=getattr(source, "default_shelf", None)
        )
        payload_items = [
            {
                "external_id": it.external_id,
                "title": it.title,
                "author": it.author,
                "isbn10": it.isbn10,
                "isbn13": it.isbn13,
                "asin": it.asin,
                "shelf": it.shelf,
            }
            for it in items
        ]

        summary = upsert_shelf_items(
            db,
            user_id=str(getattr(source, "user_id")),
            source=source,
            items=payload_items,
        )

        # Mark ok
        if hasattr(source, "last_sync_status"):
            setattr(source, "last_sync_status", "ok")
        if hasattr(source, "last_synced_at"):
            setattr(source, "last_synced_at", datetime.now(timezone.utc))
        if hasattr(source, "last_sync_error"):
            setattr(source, "last_sync_error", None)
        db.commit()

        logger.info(
            "goodreads_rss_synced",
            extra={
                "source_id": source_id,
                "user_id": str(getattr(source, "user_id")),
                "created": getattr(summary, "created", None),
                "updated": getattr(summary, "updated", None),
                "errors": len(getattr(summary, "errors", []) or []),
            },
        )

    except Exception as e:
        logger.exception(
            "goodreads_rss_sync_failed", extra={"source_id": source_id, "error": str(e)}
        )

        try:
            source = db.get(ShelfSource, source_id)
            if source is not None:
                if hasattr(source, "last_sync_status"):
                    setattr(source, "last_sync_status", "error")
                if hasattr(source, "last_sync_error"):
                    setattr(source, "last_sync_error", str(e))
                db.commit()
        except Exception:
            logger.exception(
                "goodreads_rss_sync_failed_marking_error",
                extra={"source_id": source_id},
            )
        raise
    finally:
        db.close()
