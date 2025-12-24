from __future__ import annotations

import re
from dataclasses import dataclass

_non_alnum = re.compile(r"[^a-z0-9]+")
_digits_or_x = re.compile(r"[^0-9Xx]")


def normalize_text(s: str) -> str:
    s = s.strip().lower()
    s = _non_alnum.sub(" ", s)
    s = " ".join(s.split())
    return s


def normalize_isbn(raw: str) -> str:
    """Return a best-effort normalized ISBN string.

    - Removes hyphens/spaces.
    - Keeps digits (and X for ISBN-10 check digit).
    - Does not validate checksum in Phase 2 (keep it simple and resilient).

    If you want checksum validation later, add it as a non-fatal warning and keep ingestion permissive.
    """
    cleaned = _digits_or_x.sub("", raw or "").upper()
    return cleaned


@dataclass(frozen=True)
class NormalizedIdentifiers:
    isbn13: str | None
    isbn10: str | None
    asin: str | None

    normalized_title: str
    normalized_author: str
    normalized_key: str
    needs_fuzzy_match: bool


def build_normalized(
    *,
    title: str,
    author: str,
    isbn13: str | None = None,
    isbn10: str | None = None,
    asin: str | None = None,
) -> NormalizedIdentifiers:
    n_title = normalize_text(title)
    n_author = normalize_text(author)

    i13 = normalize_isbn(isbn13) if isbn13 else None
    i10 = normalize_isbn(isbn10) if isbn10 else None

    # Prefer ISBN-13, then ISBN-10, then ASIN, else title+author.
    if i13 and len(i13) == 13 and i13.isdigit():
        key = f"isbn13:{i13}"
        return NormalizedIdentifiers(i13, i10, asin, n_title, n_author, key, False)

    if i10 and len(i10) == 10:
        key = f"isbn10:{i10}"
        return NormalizedIdentifiers(i13, i10, asin, n_title, n_author, key, False)

    if asin:
        a = asin.strip()
        key = f"asin:{a}"
        return NormalizedIdentifiers(i13, i10, a, n_title, n_author, key, False)

    # Fallback to fuzzy matching later
    key = f"title_author:{n_title}|{n_author}"
    return NormalizedIdentifiers(i13, i10, asin, n_title, n_author, key, True)
