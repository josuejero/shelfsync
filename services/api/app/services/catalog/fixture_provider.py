from __future__ import annotations

import json
import re
from pathlib import Path

from app.services.catalog.types import (
    AvailabilityStatus,
    Format,
    ProviderAvailability,
    ProviderBook,
)


def _norm(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def _norm_isbn(s: str | None) -> str | None:
    if not s:
        return None
    digits = re.sub(r"[^0-9xX]", "", s)
    return digits.upper() if digits else None


class FixtureProvider:
    name = "fixture"

    def __init__(self, fixture_path: str):
        self.fixture_path = fixture_path
        self._data = self._load()

    def _load(self) -> dict:
        p = Path(self.fixture_path)
        if not p.exists():
            raise FileNotFoundError(f"Fixture file not found: {p}")
        raw = p.read_text(encoding="utf-8")
        return json.loads(raw)

    async def search(
        self,
        *,
        title: str | None,
        author: str | None,
        isbn10: str | None,
        isbn13: str | None,
        limit: int = 10,
    ) -> list[ProviderBook]:
        items: list[dict] = self._data.get("items", [])
        q_title = _norm(title or "")
        q_author = _norm(author or "")
        q_isbn10 = _norm_isbn(isbn10)
        q_isbn13 = _norm_isbn(isbn13)

        out: list[ProviderBook] = []
        for it in items:
            it_isbn13 = _norm_isbn(it.get("isbn13"))
            it_isbn10 = _norm_isbn(it.get("isbn10"))

            # ISBN: strongest filter
            if q_isbn13 and it_isbn13 == q_isbn13:
                out.append(self._to_book(it))
                continue
            if q_isbn10 and it_isbn10 == q_isbn10:
                out.append(self._to_book(it))
                continue

            # Otherwise: basic substring match on normalized fields
            t = _norm(it.get("title", ""))
            a = _norm(it.get("author", ""))

            if q_title and q_title not in t:
                continue
            if q_author and q_author not in a:
                # allow title-only searches
                if q_title:
                    pass
                else:
                    continue

            out.append(self._to_book(it))

        return out[:limit]

    async def availability_bulk(
        self, *, provider_item_ids: list[str]
    ) -> list[ProviderAvailability]:
        wanted = set(provider_item_ids)
        out: list[ProviderAvailability] = []

        for it in self._data.get("items", []):
            if it.get("provider_item_id") not in wanted:
                continue
            formats: dict = it.get("formats", {})
            for fmt_key, payload in formats.items():
                out.append(
                    ProviderAvailability(
                        provider=self.name,
                        provider_item_id=it["provider_item_id"],
                        format=Format(fmt_key),
                        status=AvailabilityStatus(payload["status"]),
                        copies_available=payload.get("copies_available"),
                        copies_total=payload.get("copies_total"),
                        holds=payload.get("holds"),
                        deep_link=payload.get("deep_link"),
                    )
                )

        return out

    def _to_book(self, it: dict) -> ProviderBook:
        return ProviderBook(
            provider=self.name,
            provider_item_id=it["provider_item_id"],
            title=it.get("title") or "",
            author=it.get("author"),
            isbn10=it.get("isbn10"),
            isbn13=it.get("isbn13"),
            asin=it.get("asin"),
            raw=it,
        )
