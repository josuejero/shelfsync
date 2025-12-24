from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.config import settings
from app.core.redis_client import get_redis
from app.services.catalog.factory import get_provider
from app.services.catalog.types import AvailabilityStatus, Format, ProviderAvailability
from app.workers.async_utils import run_async


@dataclass(frozen=True)
class CachedAvailability:
    availability: ProviderAvailability
    last_checked_at: datetime


def _availability_key(
    *, provider: str, library_system: str, provider_item_id: str, fmt: str
) -> str:
    return f"availability:{provider}:{library_system}:{provider_item_id}:{fmt}"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_availability_cached(
    *,
    library_system: str,
    provider_item_ids: list[str],
    formats: list[str],
) -> dict[tuple[str, str], CachedAvailability]:
    """Return availability per (provider_item_id, format).

    Behavior:
    - Reads from Redis first.
    - Only calls provider for cache misses.
    - Writes misses back to Redis with TTL.

    Returns a map keyed by (provider_item_id, format).
    """

    provider = get_provider()
    provider_name = getattr(provider, "name", "unknown")

    r = get_redis()
    ttl = int(settings.availability_cache_ttl_secs)
    wanted = [(pid, fmt) for pid in provider_item_ids for fmt in formats]

    out: dict[tuple[str, str], CachedAvailability] = {}
    missing_provider_ids: set[str] = set()

    # 1) Try cache
    if r is not None:
        pipe = r.pipeline()
        keys = [
            _availability_key(
                provider=provider_name,
                library_system=library_system,
                provider_item_id=pid,
                fmt=fmt,
            )
            for (pid, fmt) in wanted
        ]
        for k in keys:
            pipe.get(k)
        values = pipe.execute()

        for (pid, fmt), raw in zip(wanted, values):
            if not raw:
                missing_provider_ids.add(pid)
                continue
            try:
                payload = json.loads(raw)
                avail = ProviderAvailability.model_validate(payload["availability"])
                last_checked = datetime.fromisoformat(payload["last_checked_at"])
                out[(pid, fmt)] = CachedAvailability(
                    availability=avail, last_checked_at=last_checked
                )
            except Exception:
                missing_provider_ids.add(pid)

    else:
        missing_provider_ids = set(provider_item_ids)

    # 2) Fetch misses
    if missing_provider_ids:
        fetched = run_async(
            provider.availability_bulk(provider_item_ids=sorted(missing_provider_ids))
        )

        checked_at = _now_utc()

        # Store provider results
        for item in fetched:
            fmt = str(item.format)
            key = (item.provider_item_id, fmt)
            out[key] = CachedAvailability(availability=item, last_checked_at=checked_at)

        # Fill any requested (pid, fmt) that provider didn't return
        for pid in missing_provider_ids:
            for fmt in formats:
                if (pid, fmt) in out:
                    continue
                out[(pid, fmt)] = CachedAvailability(
                    availability=ProviderAvailability(
                        provider=provider_name,
                        provider_item_id=pid,
                        format=Format(fmt),
                        status=AvailabilityStatus.not_owned,
                        copies_available=None,
                        copies_total=None,
                        holds=None,
                        deep_link=None,
                    ),
                    last_checked_at=checked_at,
                )

        # Write to Redis
        if r is not None:
            pipe = r.pipeline()
            for (pid, fmt), entry in out.items():
                if pid not in missing_provider_ids:
                    continue
                k = _availability_key(
                    provider=provider_name,
                    library_system=library_system,
                    provider_item_id=pid,
                    fmt=fmt,
                )
                payload = {
                    "availability": entry.availability.model_dump(mode="json"),
                    "last_checked_at": entry.last_checked_at.isoformat(),
                }
                pipe.setex(k, ttl, json.dumps(payload))
            pipe.execute()

    return out
