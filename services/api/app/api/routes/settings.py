from __future__ import annotations

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user_settings import UserSettings
from app.schemas.settings import SettingsPatchIn, UserSettingsOut
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1", tags=["settings"])


@router.get("/settings", response_model=UserSettingsOut)
def get_settings(db: Session = Depends(get_db), user=Depends(get_current_user)):
    s = db.get(UserSettings, user.id)
    if not s:
        raise HTTPException(status_code=404, detail="Settings not found")
    return s


@router.patch("/settings", response_model=UserSettingsOut)
def patch_settings(
    payload: SettingsPatchIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    s = db.get(UserSettings, user.id)
    if not s:
        raise HTTPException(status_code=404, detail="Settings not found")

    if payload.library_system is not None:
        s.library_system = payload.library_system

    if payload.preferred_formats is not None:
        # Normalize + de-dupe, keep stable order ebook->audiobook
        want = []
        for fmt in ["ebook", "audiobook"]:
            if fmt in payload.preferred_formats:
                want.append(fmt)
        s.preferred_formats = want
    
    if payload.notifications_enabled is not None:
        s.notifications_enabled = payload.notifications_enabled

    db.add(s)
    db.commit()
    db.refresh(s)
    return s
