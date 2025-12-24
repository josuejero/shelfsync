import pytest
from app.services.catalog.fixture_provider import FixtureProvider
from app.services.matching.matcher import match_shelf_item


class DummyShelfItem:
    def __init__(self, title, author=None, isbn10=None, isbn13=None):
        self.title = title
        self.author = author
        self.isbn10 = isbn10
        self.isbn13 = isbn13


@pytest.mark.asyncio
async def test_isbn_match(tmp_path):
    fixture = tmp_path / "f.json"
    fixture.write_text(
        '{"provider":"fixture","items":[{"provider_item_id":"x","title":"T","author":"A","isbn13":"9780593135204","formats":{}}]}',
        encoding="utf-8",
    )
    provider = FixtureProvider(str(fixture))
    item = DummyShelfItem(title="Project Hail Mary", author="Andy Weir", isbn13="9780593135204")

    res = await match_shelf_item(provider, item)  # type: ignore[arg-type]
    assert res is not None
    assert res.method == "isbn"
    assert res.confidence == 1.0


@pytest.mark.asyncio
async def test_fuzzy_match_threshold(tmp_path):
    fixture = tmp_path / "f.json"
    fixture.write_text(
        '{"provider":"fixture","items":[{"provider_item_id":"x","title":"The Hobbit","author":"J.R.R. Tolkien","formats":{}}]}',
        encoding="utf-8",
    )
    provider = FixtureProvider(str(fixture))

    good = DummyShelfItem(title="Hobbit", author="Tolkien")
    res = await match_shelf_item(provider, good)  # type: ignore[arg-type]
    assert res is not None
    assert res.method == "fuzzy"

    bad = DummyShelfItem(title="Completely Different Book", author="Nobody")
    res2 = await match_shelf_item(provider, bad)  # type: ignore[arg-type]
    assert res2 is None
