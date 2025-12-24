from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.shelf_item import ShelfItem
from app.models.shelf_source import ShelfSource
from app.services.normalization import normalize_text


@dataclass
class ImportErrorItem:
    key: str
    error: str


@dataclass
class ImportSummary:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[ImportErrorItem] | None = None


def upsert_shelf_items(db: Session, *, user_id: str, source: ShelfSource, items: list[dict]) -> ImportSummary:
    summary = ImportSummary(errors=[])

    # Preload existing items by external_id (best effort)
    ext_ids = [it.get("external_id") for it in items if it.get("external_id")]
    existing_by_ext: dict[str, ShelfItem] = {}

    if ext_ids:
        rows = db.execute(
            select(ShelfItem)
            .where(ShelfItem.shelf_source_id == source.id)
            .where(ShelfItem.external_id.in_(ext_ids))
        ).scalars().all()
        existing_by_ext = {r.external_id: r for r in rows if r.external_id}

    for it in items:
        try:
            title = (it.get("title") or "").strip()
            author = (it.get("author") or "").strip()
            if not title or not author:
                summary.skipped += 1
                continue

            isbn10 = it.get("isbn10")
            isbn13 = it.get("isbn13")
            asin = it.get("asin")
            ext = it.get("external_id")

            norm_title = normalize_text(title)
            norm_author = normalize_text(author)
            needs_fuzzy = not (isbn10 or isbn13 or asin)

            row = existing_by_ext.get(ext) if ext else None
            if row:
                row.title = title
                row.author = author
                row.isbn10 = isbn10
                row.isbn13 = isbn13
                row.asin = asin
                row.normalized_title = norm_title
                row.normalized_author = norm_author
                row.shelf = it.get("shelf")
                row.needs_fuzzy_match = needs_fuzzy
                summary.updated += 1
            else:
                db.add(
                    ShelfItem(
                        user_id=user_id,
                        shelf_source_id=source.id,
                        external_id=ext,
                        title=title,
                        author=author,
                        isbn10=isbn10,
                        isbn13=isbn13,
                        asin=asin,
                        normalized_title=norm_title,
                        normalized_author=norm_author,
                        shelf=it.get("shelf"),
                        needs_fuzzy_match=needs_fuzzy,
                    )
                )
                summary.created += 1

        except Exception as e:
            summary.errors.append(ImportErrorItem(key=str(it.get("external_id") or title), error=str(e)))

    db.commit()
    return summary