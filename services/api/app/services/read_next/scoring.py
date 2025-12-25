from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _ci(s: str | None) -> str:
    return (s or "").strip().casefold()


def _fmt(fmt: str | None) -> str:
    return _ci(fmt)


def estimate_hold_pressure(holds: int | None, copies_total: int | None) -> float | None:
    if holds is None or copies_total is None or copies_total <= 0:
        return None
    return holds / copies_total


@dataclass(frozen=True)
class ReadNextScore:
    score: float
    tier: str
    best_format: str | None
    hold_ratio: float | None
    reasons: list[str]


def score_candidates(
    availability: list[dict[str, Any]],
    preferred_formats: list[str],
) -> ReadNextScore:
    preferred = [_fmt(f) for f in preferred_formats]

    best_score = -1.0
    best_tier = "not_owned"
    best_format: str | None = None
    best_hold_ratio: float | None = None
    reasons: list[str] = []

    for a in availability:
        fmt = _fmt(a.get("format"))
        status = _ci(a.get("status"))

        copies_available = a.get("copies_available")
        copies_total = a.get("copies_total")
        holds = a.get("holds")

        tier = "not_owned"
        base = 0.0
        if status == "available" and (copies_available or 0) > 0:
            tier = "available"
            base = 100.0
        elif status in {"hold", "holds"}:
            tier = "hold"
            base = 50.0
        elif status == "not_owned":
            tier = "not_owned"
            base = 0.0
        else:
            tier = "unknown"
            base = 10.0

        fmt_bonus = 0.0
        if fmt in preferred:
            fmt_bonus = 10.0 * (len(preferred) - preferred.index(fmt))

        hold_ratio = estimate_hold_pressure(holds, copies_total)
        pressure_penalty = 0.0
        if tier == "hold" and hold_ratio is not None:
            pressure_penalty = min(25.0, hold_ratio * 5.0)

        score = base + fmt_bonus - pressure_penalty

        if score > best_score:
            best_score = score
            best_tier = tier
            best_format = fmt or None
            best_hold_ratio = hold_ratio

    reasons.append(f"tier={best_tier}")
    if best_format:
        reasons.append(f"format={best_format}")

    return ReadNextScore(
        score=float(best_score),
        tier=best_tier,
        best_format=best_format,
        hold_ratio=best_hold_ratio,
        reasons=reasons,
    )
