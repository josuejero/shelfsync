from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: str
    created_at: datetime
    read_at: datetime | None

    shelf_item_id: str
    title: str
    author: str | None

    format: str
    old_status: str
    new_status: str
    deep_link: str | None


class PageOut(BaseModel):
    limit: int
    offset: int
    total: int


class NotificationListOut(BaseModel):
    page: PageOut
    items: list[NotificationOut]


class UnreadCountOut(BaseModel):
    unread: int
