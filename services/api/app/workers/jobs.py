from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.shelf_source import ShelfSource
from app.services.goodreads_rss import fetch_rss, parse_goodreads_rss
from app.services.shelf_import import upsert_shelf_items


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
            "errors": [e.__dict__ for e in (summary.errors or [])],
        }

    except Exception as e:
        # Best-effort status update
        try:
            source = db.execute(select(ShelfSource).where(ShelfSource.id == source_id)).scalar_one_or_none()
            if source:
                source.last_sync_status = "error"
                source.last_sync_error = str(e)
                source.last_synced_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass
        raise

    finally:
        db.close()