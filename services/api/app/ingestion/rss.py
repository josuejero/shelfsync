from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup

ISBN_RE = re.compile(r"\b(?:ISBN(?:-13)?|ISBN13)\s*[:#]?\s*([0-9\-]{10,17})\b", re.IGNORECASE)
ASIN_RE = re.compile(r"\bASIN\s*[:#]?\s*([A-Z0-9]{8,20})\b", re.IGNORECASE)


def _local(tag: str) -> str:
    # Handles namespaced tags like {http://purl.org/dc/elements/1.1/}creator
    return tag.split("}")[-1]


def _find_first_text(elem: ET.Element, wanted: set[str]) -> str | None:
    for child in elem.iter():
        if _local(child.tag) in wanted and (child.text or "").strip():
            return (child.text or "").strip()
    return None


def _extract_identifiers_from_description(description_html: str) -> tuple[str | None, str | None]:
    if not description_html:
        return None, None

    # Goodreads often embeds metadata in HTML inside <description>.
    soup = BeautifulSoup(description_html, "html.parser")
    text = soup.get_text(" ", strip=True)

    isbn = None
    asin = None

    m = ISBN_RE.search(text)
    if m:
        isbn = m.group(1)

    m2 = ASIN_RE.search(text)
    if m2:
        asin = m2.group(1)

    return isbn, asin


def parse_goodreads_rss(xml_text: str) -> list[dict]:
    """Parse a Goodreads shelf RSS feed.

    Returns a list of dicts with minimal fields:
    - title
    - author
    - isbn (raw-ish, may be isbn10 or isbn13)
    - asin
    - goodreads_book_id (best-effort)

    The parser is defensive: it will skip items missing title/author.
    """

    root = ET.fromstring(xml_text)
    items = root.findall(".//item")

    out: list[dict] = []

    for item in items:
        title = _find_first_text(item, {"title"})
        author = _find_first_text(item, {"author_name", "creator", "author"})
        link = _find_first_text(item, {"link"})
        description = _find_first_text(item, {"description", "encoded"})

        if not title or not author:
            continue

        isbn_from_desc, asin_from_desc = _extract_identifiers_from_description(description or "")

        goodreads_book_id = None
        if link and "/book/show/" in link:
            # https://www.goodreads.com/book/show/<id>-...
            try:
                part = link.split("/book/show/", 1)[1]
                goodreads_book_id = part.split("-", 1)[0].strip("/")
            except Exception:
                goodreads_book_id = None

        out.append(
            {
                "title": title.strip(),
                "author": author.strip(),
                "isbn": isbn_from_desc,
                "asin": asin_from_desc,
                "goodreads_book_id": goodreads_book_id,
            }
        )

    return out
