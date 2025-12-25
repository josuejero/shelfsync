from __future__ import annotations

from dataclasses import dataclass

from app.domain.normalize import build_normalized
from app.models.shelf_item import ShelfItem
from sqlalchemy.orm import Session


@dataclass
class ImportSummary:
    created: int
    updated: int
    skipped: int
    errors: list[str]


def upsert_shelf_items(
    *,
    db: Session,
    user_id: str,
    shelf_source_id: str | None,
    items: list[dict],
    errors: list[str] | None = None,
) -> ImportSummary:
    errors_out = list(errors or [])

    def _external_id(item: dict) -> str | None:
        raw = item.get("external_id") or item.get("goodreads_book_id")
        if raw is None:
            return None
        value = str(raw).strip()
        return value or None

    ext_ids = [ext for ext in (_external_id(it) for it in items) if ext]
    existing_by_ext: dict[str, ShelfItem] = {}
    if ext_ids:
        query = db.query(ShelfItem).filter(ShelfItem.user_id == user_id)
        if shelf_source_id is None:
            query = query.filter(ShelfItem.shelf_source_id.is_(None))
        else:
            query = query.filter(ShelfItem.shelf_source_id == shelf_source_id)
        existing = query.filter(ShelfItem.external_id.in_(ext_ids)).all()
        existing_by_ext = {it.external_id: it for it in existing if it.external_id}

    created = updated = skipped = 0

    for it in items:
        title = (it.get("title") or "").strip()
        author = (it.get("author") or "").strip()

        if not title or not author:
            skipped += 1
            errors_out.append("Skipped item missing title/author")
            continue

        isbn13 = it.get("isbn13")
        isbn10 = it.get("isbn10")

        # RSS provides a single "isbn" sometimes; treat as isbn10/13 raw.
        if not isbn13 and not isbn10 and it.get("isbn"):
            raw_isbn = it.get("isbn")
            if raw_isbn and len(str(raw_isbn).strip()) >= 10:
                # Best-effort: put into isbn13 if it looks 13 digits, else isbn10.
                s = str(raw_isbn).strip()
                if len("".join([c for c in s if c.isdigit()])) >= 13:
                    isbn13 = s
                else:
                    isbn10 = s

        asin = it.get("asin")
        external_id = _external_id(it)

        norm = build_normalized(
            title=title,
            author=author,
            isbn13=isbn13,
            isbn10=isbn10,
            asin=asin,
        )

        existing_item = existing_by_ext.get(external_id) if external_id else None
        if existing_item:
            # Update key fields (keep this conservative).
            existing_item.title = title
            existing_item.author = author
            existing_item.isbn13 = norm.isbn13
            existing_item.isbn10 = norm.isbn10
            existing_item.asin = norm.asin
            existing_item.normalized_title = norm.normalized_title
            existing_item.normalized_author = norm.normalized_author
            existing_item.needs_fuzzy_match = norm.needs_fuzzy_match
            existing_item.shelf_source_id = shelf_source_id
            existing_item.external_id = external_id
            existing_item.shelf = it.get("shelf")

            updated += 1
            continue

        new_item = ShelfItem(
            user_id=user_id,
            shelf_source_id=shelf_source_id,
            external_id=external_id,
            title=title,
            author=author,
            isbn13=norm.isbn13,
            isbn10=norm.isbn10,
            asin=norm.asin,
            normalized_title=norm.normalized_title,
            normalized_author=norm.normalized_author,
            shelf=it.get("shelf"),
            needs_fuzzy_match=norm.needs_fuzzy_match,
        )
        db.add(new_item)
        if external_id:
            existing_by_ext[external_id] = new_item
        created += 1

    return ImportSummary(
        created=created, updated=updated, skipped=skipped, errors=errors_out
    )
