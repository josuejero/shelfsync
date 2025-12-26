from __future__ import annotations

import asyncio
import importlib
import inspect
import logging
from datetime import datetime, timezone
from typing import Any

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
from app.models.shelf_item import ShelfItem
from app.providers.factory import get_provider as get_availability_provider
from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _try_publish(fn_name: str, **kwargs: Any) -> None:
    """
    Publish events if an implementation exists, without hard imports.

    Tries modules in order, and no-ops if not found. This keeps mypy happy and
    avoids runtime import explosions when optional publishing code isn't present.
    """
    for module_name in ("app.workers.events", "app.workers.publish"):
        try:
            mod = importlib.import_module(module_name)
        except Exception:
            continue
        fn = getattr(mod, fn_name, None)
        if callable(fn):
            try:
                fn(**kwargs)
            except Exception:
                logger.exception("publish failed", extra={"fn": fn_name, "module": module_name})
            return


def publish_notification_event(*, user_id: str, payload: dict[str, Any]) -> None:
    _try_publish("publish_notification_event", user_id=user_id, payload=payload)


def publish_sync_event(
    *, user_id: str, run_id: str | None, type_: str, payload: dict[str, Any]
) -> None:
    _try_publish(
        "publish_sync_event", user_id=user_id, run_id=run_id, type_=type_, payload=payload
    )


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

        provider = get_availability_provider(db, user_id=run.user_id)

        processed = 0
        batch_size = 50

        for i in range(0, total, batch_size):
            chunk = items[i : i + batch_size]
            results = provider.availability_bulk(chunk)

            created = upsert_snapshots(db, user_id=run.user_id, results=results)
            processed += len(chunk)

            update_progress(db, run=run, current=processed)  # typically commits

            if created:
                # Hydrate titles for nicer live notifications
                ids = [c.shelf_item_id for c in created]
                rows = (
                    db.execute(
                        select(ShelfItem.id, ShelfItem.title).where(ShelfItem.id.in_(ids))
                    )
                    .tuples()
                    .all()
                )
                id_to_title: dict[str, str] = {sid: title for sid, title in rows}

                for c in created:
                    publish_notification_event(
                        user_id=run.user_id,
                        payload={
                            "id": c.id,
                            "shelf_item_id": c.shelf_item_id,
                            "title": id_to_title.get(c.shelf_item_id, ""),
                            "format": c.format,
                        },
                    )

            publish_sync_event(
                user_id=run.user_id,
                run_id=run.id,
                type_="availability_progress",
                payload={"current": processed, "total": total},
            )

        set_sync_run_succeeded(db, run=run)
        publish_sync_event(
            user_id=run.user_id,
            run_id=run.id,
            type_="availability_succeeded",
            payload={"current": processed, "total": total},
        )

    except Exception as e:
        logger.exception("availability_refresh_job failed")
        try:
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


def refresh_matching_for_user(user_id: str) -> dict[str, int]:
    """
    TODO: Implement matching refresh using app/services/matching/*.

    This function is kept so imports and job registration remain stable,
    but matching refresh is currently a no-op.
    """
    db: Session = SessionLocal()
    try:
        items = list_shelf_items_for_user(db, user_id=user_id)
        total = len(items)
        return {"matched": 0, "total": total}
    finally:
        db.close()


def sync_goodreads_rss(source_id: str) -> None:
    """
    TODO: Implement RSS sync through your ingestion pipeline.

    Kept as a stub so job registration doesn't break.
    """
    # If you later add an ingestion entrypoint, call it here.
    return
