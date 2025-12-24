from __future__ import annotations

from app.models.shelf_item import ShelfItem
from sqlalchemy import select
from sqlalchemy.orm import Session


def list_shelf_items_for_user(db: Session, *, user_id: str) -> list[ShelfItem]:
    """Return the user's shelf items ordered from newest to oldest."""
    stmt = (
        select(ShelfItem).where(ShelfItem.user_id == user_id).order_by(ShelfItem.updated_at.desc())
    )
    return db.execute(stmt).scalars().all()
