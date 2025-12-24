from __future__ import annotations

from typing import Iterable

from app.models.catalog_item import CatalogItem
from app.models.catalog_match import CatalogMatch
from app.models.shelf_item import ShelfItem
from app.providers.types import AvailabilityResult
from app.services.catalog.factory import get_provider as get_catalog_provider
from app.workers.async_utils import run_async
from sqlalchemy import select
from sqlalchemy.orm import Session


class AvailabilityProvider:
    """Adapter that fetches provider availability for matched catalog items."""

    def __init__(self, db: Session, user_id: str):
        self._db = db
        self._user_id = user_id
        self._catalog_provider = get_catalog_provider()

    def availability_bulk(self, items: Iterable[ShelfItem]) -> list[AvailabilityResult]:
        shelf_ids = [s.id for s in items]
        if not shelf_ids:
            return []

        stmt = (
            select(CatalogMatch, CatalogItem)
            .where(CatalogMatch.user_id == self._user_id)
            .where(CatalogMatch.shelf_item_id.in_(shelf_ids))
            .join(CatalogItem, CatalogItem.id == CatalogMatch.catalog_item_id)
            .where(CatalogItem.provider == self._catalog_provider.name)
        )
        rows = self._db.execute(stmt).all()
        if not rows:
            return []

        provider_to_catalog: dict[str, str] = {}
        provider_item_ids: list[str] = []
        for _, catalog_item in rows:
            pid = catalog_item.provider_item_id
            if pid in provider_to_catalog:
                continue
            provider_to_catalog[pid] = catalog_item.id
            provider_item_ids.append(pid)

        if not provider_item_ids:
            return []

        availabilities = run_async(
            self._catalog_provider.availability_bulk(provider_item_ids=provider_item_ids)
        )

        out: list[AvailabilityResult] = []
        for availability in availabilities:
            catalog_id = provider_to_catalog.get(availability.provider_item_id)
            if not catalog_id:
                continue
            out.append(AvailabilityResult(catalog_item_id=catalog_id, availability=availability))

        return out


def get_provider(db: Session, user_id: str) -> AvailabilityProvider:
    """
    Return a provider configured for the given user.

    The provider looks up existing catalog matches and delegates availability
    lookups to the configured catalog provider.
    """

    return AvailabilityProvider(db=db, user_id=user_id)
