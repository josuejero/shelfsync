from __future__ import annotations

from pydantic import BaseModel


class LibraryOut(BaseModel):
    id: str
    name: str

    class Config:
        from_attributes = True
