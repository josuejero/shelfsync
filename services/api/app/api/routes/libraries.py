from __future__ import annotations

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.library import Library
from app.schemas.library import LibraryOut
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["libraries"])


@router.get("/libraries", response_model=list[LibraryOut])
def list_libraries(db: Session = Depends(get_db), user=Depends(get_current_user)):
    # user dependency enforces auth
    return db.query(Library).order_by(Library.name.asc()).all()
