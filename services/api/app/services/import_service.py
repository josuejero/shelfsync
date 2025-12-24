from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.domain.normalize import build_normalized
from app.models.shelf_item import ShelfItem


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

    # Preload existing items for this user keyed by normalized_key for fast upsert.
    existing = (
        db.query(ShelfItem)
        .filter(ShelfItem.user_id == user_id)
        .all()
    )
    by_key = {it.normalized_key: it for it in existing}

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

        norm = build_normalized(
            title=title,
            author=author,
            isbn13=isbn13,
            isbn10=isbn10,
            asin=asin,
        )

        existing_item = by_key.get(norm.normalized_key)
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

            # Optional goodreads metadata
            if it.get("goodreads_book_id"):
                existing_item.goodreads_book_id = str(it.get("goodreads_book_id"))

            updated += 1
            continue

        new_item = ShelfItem(
            user_id=user_id,
            shelf_source_id=shelf_source_id,
            title=title,
            author=author,
            isbn13=norm.isbn13,
            isbn10=norm.isbn10,
            asin=norm.asin,
            goodreads_book_id=str(it.get("goodreads_book_id")) if it.get("goodreads_book_id") else None,
            normalized_title=norm.normalized_title,
            normalized_author=norm.normalized_author,
            normalized_key=norm.normalized_key,
            needs_fuzzy_match=norm.needs_fuzzy_match,
        )
        db.add(new_item)
        by_key[norm.normalized_key] = new_item
        created += 1

    return ImportSummary(created=created, updated=updated, skipped=skipped, errors=errors_out)