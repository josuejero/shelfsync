from __future__ import annotations

from app.services.catalog.provider import CatalogProvider
from app.services.catalog.types import ProviderAvailability, ProviderBook


class OverDriveProvider:
    """Phase 3: interface placeholder.

    Phase 5+: implement real OverDrive/Libby calls (and/or scraping) behind env creds.
    """

    name = "overdrive"

    async def search(
        self,
        *,
        title: str | None,
        author: str | None,
        isbn10: str | None,
        isbn13: str | None,
        limit: int = 10,
    ) -> list[ProviderBook]:
        raise NotImplementedError("OverDriveProvider is implemented in Phase 5+")

    async def availability_bulk(
        self, *, provider_item_ids: list[str]
    ) -> list[ProviderAvailability]:
        raise NotImplementedError("OverDriveProvider is implemented in Phase 5+")
