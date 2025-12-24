from __future__ import annotations

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.shelf_item import ShelfItem
from app.schemas.shelf import ShelfItemOut
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/shelf-items", tags=["shelf-items"])


@router.get("", response_model=list[ShelfItemOut])
def list_shelf_items(
    source_id: str | None = None,
    shelf: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(ShelfItem).where(ShelfItem.user_id == user.id)
    if source_id:
        q = q.where(ShelfItem.shelf_source_id == source_id)
    if shelf:
        q = q.where(ShelfItem.shelf == shelf)
    q = q.order_by(ShelfItem.updated_at.desc()).limit(limit).offset(offset)

    rows = db.execute(q).scalars().all()
    return rows
