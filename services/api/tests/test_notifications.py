from app.crud.availability import upsert_snapshots
from app.models import AvailabilitySnapshot, CatalogItem, CatalogMatch, ShelfItem, User, UserSettings
from app.providers.types import AvailabilityResult
from app.services.catalog.types import ProviderAvailability, Format, AvailabilityStatus


def test_notification_created_on_hold_to_available(db_session):
    user = User(email="a@example.com", hashed_password="x")
    db_session.add(user)
    db_session.commit()

    db_session.add(
        UserSettings(
            user_id=user.id,
            library_system="demo",
            preferred_formats=["ebook"],
            notifications_enabled=True,
        )
    )

    shelf_item = ShelfItem(user_id=user.id, title="T", author="A")
    db_session.add(shelf_item)

    catalog_item = CatalogItem(
        id="c1",
        provider="fixture",
        provider_item_id="p1",
        title="T",
        author="A",
    )
    db_session.add(catalog_item)

    db_session.add(
        CatalogMatch(
            user_id=user.id,
            shelf_item_id=shelf_item.id,
            catalog_item_id=catalog_item.id,
            provider="fixture",
            method="exact",
            confidence=1.0,
        )
    )

    # Existing snapshot: hold
    db_session.add(
        AvailabilitySnapshot(
            user_id=user.id,
            catalog_item_id=catalog_item.id,
            format="ebook",
            status="hold",
            copies_available=0,
            copies_total=1,
            holds=5,
            deep_link=None,
            last_checked_at=None,
        )
    )
    db_session.commit()

    # New result: available
    a = ProviderAvailability(
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
        results=[AvailabilityResult(catalog_item_id=catalog_item.id, availability=a)],
    )

    assert len(created) == 1


def test_notifications_respect_user_setting(db_session):
    user = User(email="b@example.com", hashed_password="x")
    db_session.add(user)
    db_session.commit()

    db_session.add(
        UserSettings(
            user_id=user.id,
            library_system="demo",
            preferred_formats=["ebook"],
            notifications_enabled=False,
        )
    )
    db_session.commit()

    a = ProviderAvailability(
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
        results=[AvailabilityResult(catalog_item_id="c1", availability=a)],
    )

    assert created == []