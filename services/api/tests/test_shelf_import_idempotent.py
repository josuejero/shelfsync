from app.models.base import Base
from app.models.shelf_source import ShelfSource
from app.services.shelf_import import upsert_shelf_items
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def test_upsert_idempotent():
    eng = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(bind=eng)
    Session = sessionmaker(bind=eng)

    db = Session()
    source = ShelfSource(
        user_id="u1",
        source_type="rss",
        provider="goodreads",
        source_ref="x",
        meta={},
        is_active=True,
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    items = [
        {
            "external_id": "1",
            "title": "A",
            "author": "B",
            "isbn10": None,
            "isbn13": None,
            "asin": None,
            "shelf": "to-read",
        }
    ]

    s1 = upsert_shelf_items(db, user_id="u1", source=source, items=items)
    assert s1.created == 1

    s2 = upsert_shelf_items(db, user_id="u1", source=source, items=items)
    assert s2.created == 0
    assert s2.updated == 1
