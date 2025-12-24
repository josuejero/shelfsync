from __future__ import annotations

import csv
import io

REQUIRED = {"title", "author"}


def _normalize_header(h: str) -> str:
    return " ".join((h or "").strip().lower().split())


def parse_goodreads_csv(csv_bytes: bytes) -> tuple[list[dict], list[str]]:
    """Parse Goodreads export CSV.

    Returns: (items, errors)
    Each item contains minimal fields:
    - title
    - author
    - isbn13
    - isbn10
    - asin

    Parsing is forgiving about extra columns.
    It collects row-level errors and continues, unless the file is structurally invalid.
    """

    errors: list[str] = []

    try:
        text = csv_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = csv_bytes.decode("utf-8", errors="replace")

    buf = io.StringIO(text)
    reader = csv.DictReader(buf)

    if not reader.fieldnames:
        return [], ["CSV appears to be missing a header row."]

    # Build a header map so we can handle variants like "ISBN13" vs "ISBN 13".
    header_map = {_normalize_header(h): h for h in reader.fieldnames}

    missing = [h for h in REQUIRED if h not in header_map]
    if missing:
        return [], [f"CSV is missing required column(s): {', '.join(sorted(missing))}"]

    title_col = header_map["title"]
    author_col = header_map["author"]

    isbn13_col = header_map.get("isbn13") or header_map.get("isbn 13")
    isbn10_col = header_map.get("isbn") or header_map.get("isbn10") or header_map.get("isbn 10")
    asin_col = header_map.get("asin")

    items: list[dict] = []

    for idx, row in enumerate(reader, start=2):
        title = (row.get(title_col) or "").strip()
        author = (row.get(author_col) or "").strip()

        if not title or not author:
            errors.append(f"Row {idx}: missing title or author")
            continue

        items.append(
            {
                "title": title,
                "author": author,
                "isbn13": (row.get(isbn13_col) or "").strip() if isbn13_col else None,
                "isbn10": (row.get(isbn10_col) or "").strip() if isbn10_col else None,
                "asin": (row.get(asin_col) or "").strip() if asin_col else None,
            }
        )

    return items, errors
