from __future__ import annotations

import csv
import io

from app.services.normalization import normalize_isbn


class CsvImportError(Exception):
    pass


def parse_goodreads_csv(content: bytes) -> tuple[list[dict], list[dict]]:
    """Return (rows, errors).

    Each row dict is normalized to the same shape consumed by the ingest layer.
    """
    errors: list[dict] = []

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvImportError("CSV must be UTF-8 encoded (Goodreads export is usually UTF-8).")

    reader = csv.DictReader(io.StringIO(text))
    required = {"Title", "Author"}

    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise CsvImportError(
            "CSV is missing required columns. Expected at least: Title, Author. "
            "Tip: export from Goodreads: My Books → Import and Export → Export Library."
        )

    out: list[dict] = []
    for i, row in enumerate(reader, start=2):  # header is line 1
        try:
            title = (row.get("Title") or "").strip()
            author = (row.get("Author") or "").strip()
            if not title or not author:
                errors.append({"line": i, "error": "Missing Title/Author"})
                continue

            external_id = (row.get("Book Id") or "").strip() or None
            isbn10 = normalize_isbn(row.get("ISBN"))
            isbn13 = normalize_isbn(row.get("ISBN13"))
            shelf = (row.get("Exclusive Shelf") or "").strip() or None

            out.append(
                {
                    "external_id": external_id,
                    "title": title,
                    "author": author,
                    "isbn10": isbn10,
                    "isbn13": isbn13,
                    "asin": None,
                    "shelf": shelf,
                }
            )
        except Exception as e:
            errors.append({"line": i, "error": f"Unexpected row error: {e}"})

    return out, errors