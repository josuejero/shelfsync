from __future__ import annotations

from typing import Iterable

from app.providers.types import AvailabilityResult
from app.services.matching.persist import upsert_availability_snapshot
from sqlalchemy.orm import Session


def upsert_snapshots(
    db: Session, *, user_id: str, results: Iterable[AvailabilityResult]
) -> None:
    """Persist availability snapshots that were returned from the provider."""

    for result in results:
        upsert_availability_snapshot(
            db,
            user_id=user_id,
            catalog_item_id=result.catalog_item_id,
            a=result.availability,
        )
