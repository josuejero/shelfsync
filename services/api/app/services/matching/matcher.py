from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from app.models.shelf_item import ShelfItem
from app.services.catalog.provider import CatalogProvider
from app.services.catalog.types import ProviderBook


def _norm_text(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def _ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


@dataclass(frozen=True)
class MatchResult:
    book: ProviderBook
    method: str  # isbn | fuzzy
    confidence: float
    evidence: dict


async def match_shelf_item(
    provider: CatalogProvider, item: ShelfItem, *, limit: int = 10
) -> MatchResult | None:
    # 1) ISBN exact
    candidates = await provider.search(
        title=item.title,
        author=item.author,
        isbn10=item.isbn10,
        isbn13=item.isbn13,
        limit=limit,
    )

    if item.isbn13:
        for c in candidates:
            if c.isbn13 and c.isbn13.replace("-", "") == item.isbn13.replace("-", ""):
                return MatchResult(
                    book=c,
                    method="isbn",
                    confidence=1.0,
                    evidence={"reason": "isbn13 exact", "candidates": [c.model_dump()]},
                )

    if item.isbn10:
        for c in candidates:
            if c.isbn10 and c.isbn10.replace("-", "") == item.isbn10.replace("-", ""):
                return MatchResult(
                    book=c,
                    method="isbn",
                    confidence=1.0,
                    evidence={"reason": "isbn10 exact", "candidates": [c.model_dump()]},
                )

    # 2) Fuzzy (title + author)
    t = _norm_text(item.title or "")
    a = _norm_text(item.author or "")

    scored: list[tuple[float, float, ProviderBook]] = []
    for c in candidates:
        ct = _norm_text(c.title or "")
        ca = _norm_text(c.author or "")
        title_score = _ratio(t, ct)
        author_score = _ratio(a, ca) if a and ca else 0.5
        combined = 0.75 * title_score + 0.25 * author_score
        scored.append((combined, title_score, c))

    if not scored:
        return None

    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    best_combined, best_title, best = scored[0]

    # Threshold: tune later; keep conservative to avoid false positives
    if best_combined < 0.72:
        return None

    evidence = {
        "threshold": 0.72,
        "title_norm": t,
        "author_norm": a,
        "best": {
            "combined": best_combined,
            "title_score": best_title,
            "book": best.model_dump(),
        },
        "top_candidates": [
            {
                "combined": s[0],
                "title_score": s[1],
                "book": s[2].model_dump(),
            }
            for s in scored[:5]
        ],
    }

    return MatchResult(
        book=best, method="fuzzy", confidence=float(best_combined), evidence=evidence
    )
