from __future__ import annotations

from dataclasses import dataclass

from app.services.catalog.types import ProviderAvailability


@dataclass(frozen=True)
class AvailabilityResult:
    """Holds availability data keyed by the catalog item that owns it."""

    catalog_item_id: str
    availability: ProviderAvailability
