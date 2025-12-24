import pytest

from app.services.goodreads_rss import parse_goodreads_rss


def test_parse_goodreads_rss_minimal():
    xml = """<?xml version="1.0"?>
<rss><channel>
  <item>
    <guid>123</guid>
    <book_title>The Hobbit</book_title>
    <author_name>J.R.R. Tolkien</author_name>
    <isbn13>9780547928227</isbn13>
  </item>
</channel></rss>
"""

    items = parse_goodreads_rss(xml, default_shelf="to-read")
    assert len(items) == 1
    assert items[0].external_id == "123"
    assert items[0].title == "The Hobbit"
    assert items[0].author == "J.R.R. Tolkien"
    assert items[0].isbn13 == "9780547928227"
    assert items[0].shelf == "to-read"


def test_parse_bad_xml_raises():
    with pytest.raises(ValueError):
        parse_goodreads_rss("<rss>")