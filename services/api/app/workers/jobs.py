from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.shelf_item import ShelfItem
from app.models.shelf_source import ShelfSource
from app.services.catalog.factory import get_provider
from app.services.goodreads_rss import fetch_rss, parse_goodreads_rss
from app.services.matching.matcher import match_shelf_item
from app.services.matching.persist import (
    upsert_availability_snapshot,
    upsert_catalog_item,
    upsert_match,
)
from app.services.shelf_import import upsert_shelf_items
from app.workers.async_utils import run_async
from sqlalchemy import select


def sync_goodreads_rss(source_id: str) -> dict:
    """RQ entrypoint. Fetch RSS, parse, import, update source sync metadata."""

    db = SessionLocal()
    try:
        source = db.execute(select(ShelfSource).where(ShelfSource.id == source_id)).scalar_one()

        url = source.source_ref
        default_shelf = (source.meta or {}).get("shelf")

        xml = asyncio.run(fetch_rss(url))
        parsed = parse_goodreads_rss(xml, default_shelf=default_shelf)

        items = [
            {
                "external_id": p.external_id,
                "title": p.title,
                "author": p.author,
                "isbn10": p.isbn10,
                "isbn13": p.isbn13,
                "asin": p.asin,
                "shelf": p.shelf,
            }
            for p in parsed
        ]

        summary = upsert_shelf_items(db, user_id=source.user_id, source=source, items=items)

        source.last_sync_status = "ok"
        source.last_sync_error = None
        source.last_synced_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "source_id": source_id,
            "created": summary.created,
            "updated": summary.updated,
            "skipped": summary.skipped,
            "errors": [e.__dict__ for e in summary.errors],
        }

    except Exception as e:
        # Best-effort status update
        try:
            error_source = (
                db.execute(select(ShelfSource).where(ShelfSource.id == source_id))
            ).scalar_one_or_none()
            if error_source:
                error_source.last_sync_status = "error"
                error_source.last_sync_error = str(e)
                error_source.last_synced_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
        raise

    finally:
        db.close()


def refresh_matching_for_user(user_id: str) -> dict:
    """Compute matches + availability for one user.

    Called by RQ worker.
    """

    provider = get_provider()

    with SessionLocal() as db:
        shelf_items = (
            db.execute(select(ShelfItem).where(ShelfItem.user_id == user_id)).scalars().all()
        )

        matched = 0
        unmatched = 0
        provider_item_to_catalog_id: dict[str, str] = {}

        for si in shelf_items:
            res = run_async(match_shelf_item(provider, si))
            if not res:
                unmatched += 1
                continue

            ci = upsert_catalog_item(db, res.book)
            db.flush()  # ensures ci.id exists

            upsert_match(
                db,
                user_id=user_id,
                shelf_item_id=si.id,
                catalog_item_id=ci.id,
                provider=res.book.provider,
                method=res.method,
                confidence=res.confidence,
                evidence=res.evidence,
            )

            provider_item_to_catalog_id[res.book.provider_item_id] = ci.id
            matched += 1

        # Availability in bulk for matched items
        if provider_item_to_catalog_id:
            avails = run_async(
                provider.availability_bulk(
                    provider_item_ids=list(provider_item_to_catalog_id.keys())
                )
            )
            for a in avails:
                catalog_id = provider_item_to_catalog_id.get(a.provider_item_id)
                if not catalog_id:
                    continue
                upsert_availability_snapshot(db, user_id=user_id, catalog_item_id=catalog_id, a=a)

        db.commit()

        return {
            "provider": provider.name,
            "shelf_items": len(shelf_items),
            "matched": matched,
            "unmatched": unmatched,
        }
