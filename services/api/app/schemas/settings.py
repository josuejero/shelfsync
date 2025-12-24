from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class UserSettingsOut(BaseModel):
    library_system: str | None
    preferred_formats: list[str]
    updated_at: datetime

    class Config:
        from_attributes = True


class SettingsPatchIn(BaseModel):
    library_system: str | None = None
    preferred_formats: list[str] | None = None
