from __future__ import annotations

import os
from typing import Sequence

from app.models.shelf_item import ShelfItem
from app.providers.types import AvailabilityResult
from app.services.catalog.types import AvailabilityStatus, Format, ProviderAvailability


class FixtureProvider:
    """A tiny availability provider used for demos/tests.

    This is intentionally simple: it returns a deterministic "available" result per item.
    The SYNC_INJECT_FAILURE_ONCE env var can be used to force a single failure.
    """

    name = "fixture"

    def availability_bulk(self, items: Sequence[ShelfItem]) -> list[AvailabilityResult]:
        if os.getenv("SYNC_INJECT_FAILURE_ONCE") == "true":
            os.environ["SYNC_INJECT_FAILURE_ONCE"] = "false"
            raise RuntimeError("Injected provider failure (demo)")

        out: list[AvailabilityResult] = []
        for it in items:
            out.append(
                AvailabilityResult(
                    catalog_item_id=it.id,
                    availability=ProviderAvailability(
                        provider="fixture",
                        provider_item_id=it.id,
                        format=Format.ebook,
                        status=AvailabilityStatus.available,
                        copies_available=1,
                        copies_total=1,
                        holds=0,
                    ),
                )
            )
        return out
