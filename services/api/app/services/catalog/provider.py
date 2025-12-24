from __future__ import annotations

from typing import Protocol

from app.services.catalog.types import ProviderAvailability, ProviderBook


class CatalogProvider(Protocol):
    name: str

    async def search(
        self,
        *,
        title: str | None,
        author: str | None,
        isbn10: str | None,
        isbn13: str | None,
        limit: int = 10,
    ) -> list[ProviderBook]: ...

    async def availability_bulk(
        self, *, provider_item_ids: list[str]
    ) -> list[ProviderAvailability]: ...
