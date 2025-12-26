from __future__ import annotations

from datetime import datetime, timezone

from app.crud.availability import upsert_snapshots
from app.models import (
    AvailabilitySnapshot,
    CatalogItem,
    CatalogMatch,
    ShelfItem,
    User,
    UserSettings,
)
from app.models.notification_event import NotificationEvent
from app.providers.types import AvailabilityResult
from app.services.catalog.types import AvailabilityStatus, Format, ProviderAvailability
from sqlalchemy import select


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _seed_user_item_match_and_hold_snapshot(
    db_session,
    *,
    email: str,
    notifications_enabled: bool,
) -> tuple[User, ShelfItem, CatalogItem]:
    user = User(email=email, password_hash="x")
    db_session.add(user)
    db_session.flush()

    settings = UserSettings(
        user_id=user.id, notifications_enabled=notifications_enabled
    )
    db_session.add(settings)

    shelf_item = ShelfItem(
        user_id=user.id,
        title="Example Title",
        author="Example Author",
        normalized_title="example title",
        normalized_author="example author",
    )
    db_session.add(shelf_item)
    db_session.flush()

    catalog_item = CatalogItem(
        id="c1",
        provider="fixture",
        provider_item_id="p1",
        title="Example Title",
        author="Example Author",
        raw={},
    )
    db_session.add(catalog_item)
    db_session.flush()

    match = CatalogMatch(
        user_id=user.id,
        shelf_item_id=shelf_item.id,
        catalog_item_id=catalog_item.id,
        provider="fixture",
        method="fixture",
        confidence=1.0,
        evidence={},
    )
    db_session.add(match)

    hold_snapshot = AvailabilitySnapshot(
        user_id=user.id,
        catalog_item_id=catalog_item.id,
        format=Format.ebook.value,
        status=AvailabilityStatus.hold.value,
        copies_available=None,
        copies_total=None,
        holds=1,
        deep_link=None,
        last_checked_at=utcnow(),
    )
    db_session.add(hold_snapshot)

    db_session.commit()
    return user, shelf_item, catalog_item


def test_notification_created_on_hold_to_available(db_session):
    user, shelf_item, catalog_item = _seed_user_item_match_and_hold_snapshot(
        db_session,
        email="a@example.com",
        notifications_enabled=True,
    )

    availability = ProviderAvailability(
        provider="fixture",
        provider_item_id="p1",
        format=Format.ebook,
        status=AvailabilityStatus.available,
        copies_available=1,
        copies_total=1,
        holds=0,
        deep_link=None,
    )

    created = upsert_snapshots(
        db_session,
        user_id=user.id,
        results=[
            AvailabilityResult(
                catalog_item_id=catalog_item.id, availability=availability
            )
        ],
    )
    db_session.commit()

    assert len(created) == 1
    assert created[0].shelf_item_id == shelf_item.id
    assert created[0].format == Format.ebook.value

    events = db_session.execute(select(NotificationEvent)).scalars().all()
    assert len(events) == 1
    ev = events[0]
    assert ev.user_id == user.id
    assert ev.shelf_item_id == shelf_item.id
    assert ev.format == Format.ebook.value
    assert ev.old_status == AvailabilityStatus.hold.value
    assert ev.new_status == AvailabilityStatus.available.value


def test_notifications_respect_user_setting(db_session):
    user, shelf_item, catalog_item = _seed_user_item_match_and_hold_snapshot(
        db_session,
        email="b@example.com",
        notifications_enabled=False,
    )

    availability = ProviderAvailability(
        provider="fixture",
        provider_item_id="p1",
        format=Format.ebook,
        status=AvailabilityStatus.available,
        copies_available=1,
        copies_total=1,
        holds=0,
        deep_link=None,
    )

    created = upsert_snapshots(
        db_session,
        user_id=user.id,
        results=[
            AvailabilityResult(
                catalog_item_id=catalog_item.id, availability=availability
            )
        ],
    )
    db_session.commit()

    assert created == []
    events = db_session.execute(select(NotificationEvent)).scalars().all()
    assert events == []
