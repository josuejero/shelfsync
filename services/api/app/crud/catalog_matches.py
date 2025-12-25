from __future__ import annotations

from app.models.catalog_match import CatalogMatch
from sqlalchemy import select
from sqlalchemy.orm import Session


def get_matches_for_shelf_item(
    db: Session,
    *,
    shelf_item_id: str,
    user_id: str | None = None,
    provider: str | None = None,
) -> list[CatalogMatch]:
    """Return all catalog matches for a given shelf item.

    Optional filters:
    - user_id: scope matches to a user (recommended)
    - provider: scope matches to a provider (e.g. "overdrive")
    """
    stmt = select(CatalogMatch).where(CatalogMatch.shelf_item_id == shelf_item_id)

    if user_id is not None:
        stmt = stmt.where(CatalogMatch.user_id == user_id)

    if provider is not None:
        stmt = stmt.where(CatalogMatch.provider == provider)

    # Prefer high-confidence matches first.
    stmt = stmt.order_by(CatalogMatch.confidence.desc(), CatalogMatch.updated_at.desc())

    return list(db.execute(stmt).scalars().all())
