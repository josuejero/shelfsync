from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence


@dataclass(frozen=True)
class ReadNextScore:
    score: float
    tier: str  # available | hold | not_owned
    best_format: str | None
    hold_ratio: float | None
    reasons: list[str]


# Large tier weights ensure “available now” dominates “hold”, etc.
_STATUS_WEIGHT: dict[str, float] = {
    "available": 1000.0,
    "hold": 500.0,
    "not_owned": 0.0,
}


def _get(obj: Any, key: str) -> Any:
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def compute_read_next(
    availability: Sequence[Any] | None,
    preferred_formats: Sequence[str],
) -> ReadNextScore:
    """Compute a deterministic, explainable score.

    `availability` can be a list of dicts (book detail endpoint) or a list of
    Pydantic models (dashboard endpoint).

    The algorithm:
    - Filter to preferred formats
    - Score each format candidate
    - Choose best candidate
    - Return score + tier + explanation

    NOTE: This is intentionally a pure function.
    """
    preferred = list(preferred_formats or [])
    avail = list(availability or [])

    if not avail:
        return ReadNextScore(
            score=_STATUS_WEIGHT["not_owned"],
            tier="not_owned",
            best_format=None,
            hold_ratio=None,
            reasons=[
                "No availability data (not owned or not checked yet)",
                "Tier: not_owned",
            ],
        )

    candidates: list[dict[str, Any]] = []

    for a in avail:
        fmt = _get(a, "format")
        if not fmt:
            continue
        if preferred and fmt not in preferred:
            continue

        status = _get(a, "status") or "not_owned"
        copies_available = _get(a, "copies_available")
        copies_total = _get(a, "copies_total")
        holds = _get(a, "holds")

        fmt_index = preferred.index(fmt) if (fmt in preferred) else 999
        # Earlier preferred formats get a larger, but bounded bonus.
        fmt_bonus = 20.0 / (fmt_index + 1) if fmt_index != 999 else 0.0

        base = _STATUS_WEIGHT.get(status, _STATUS_WEIGHT["not_owned"])

        hold_ratio: float | None = None
        hold_penalty = 0.0

        if status == "available":
            # Prefer more available copies, capped to avoid overpowering tier.
            ca = int(copies_available or 0)
            copies_bonus = float(min(max(ca, 0), 10))
        else:
            copies_bonus = 0.0

        if status == "hold":
            h = holds if holds is not None else None
            ct = copies_total if copies_total is not None else None

            if h is not None and ct is not None and int(ct) > 0:
                hold_ratio = float(h) / float(max(int(ct), 1))
                # penalty grows with queue ratio but is capped
                hold_penalty = min(hold_ratio * 25.0, 400.0)
            elif h is not None:
                # fallback: direct holds as penalty; also capped
                hold_penalty = min(float(h) * 2.0, 400.0)

        score = base + fmt_bonus + copies_bonus - hold_penalty

        candidates.append(
            {
                "fmt": fmt,
                "status": status,
                "score": score,
                "hold_ratio": hold_ratio,
                "copies_available": copies_available,
                "copies_total": copies_total,
                "holds": holds,
                "fmt_index": fmt_index,
            }
        )

    if not candidates:
        return ReadNextScore(
            score=_STATUS_WEIGHT["not_owned"],
            tier="not_owned",
            best_format=None,
            hold_ratio=None,
            reasons=["No preferred-format availability data", "Tier: not_owned"],
        )

    # Pick the highest numeric score. The tie-break here prefers better fmt index only
    # when scores are equal; overall stability is handled by API/UI sorting tie-breaks.
    best = max(candidates, key=lambda x: (x["score"], -x["fmt_index"]))

    tier = best["status"]
    best_format = best["fmt"]
    hold_ratio = best["hold_ratio"]

    reasons: list[str] = []

    if tier == "available":
        reasons.append(
            f"Available now in {best_format} (preferred #{best['fmt_index'] + 1})"
            if best_format in preferred
            else f"Available now in {best_format}"
        )
        if (
            best.get("copies_available") is not None
            or best.get("copies_total") is not None
        ):
            reasons.append(
                f"Copies available: {best.get('copies_available') or 0} / {best.get('copies_total') or 0}"
            )

    elif tier == "hold":
        reasons.append(
            f"On hold in {best_format} (preferred #{best['fmt_index'] + 1})"
            if best_format in preferred
            else f"On hold in {best_format}"
        )
        if (
            hold_ratio is not None
            and best.get("holds") is not None
            and best.get("copies_total") is not None
        ):
            reasons.append(
                f"Hold queue: {best.get('holds')} holds / {best.get('copies_total')} copies (ratio {hold_ratio:.2f})"
            )
        elif best.get("holds") is not None:
            reasons.append(f"Hold queue: {best.get('holds')} holds")
        else:
            reasons.append("Hold queue length unavailable")

    else:
        reasons.append("Not owned in your selected library/catalog")

    reasons.append(f"Tier: {tier}")

    return ReadNextScore(
        score=float(best["score"]),
        tier=tier,
        best_format=best_format,
        hold_ratio=hold_ratio,
        reasons=reasons,
    )
