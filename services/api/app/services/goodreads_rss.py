from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree as ET

import httpx
from app.core.config import settings
from app.services.normalization import normalize_isbn

@dataclass(frozen=True)
class GoodreadsRssItem:
    external_id: str | None
    title: str
    author: str
    isbn10: str | None
    isbn13: str | None
    asin: str | None
    shelf: str | None

def _local(tag: str) -> str:
    # "{namespace}name" -> "name"
    return tag.split("}", 1)[-1]


def _child_text(item: ET.Element, wanted: Iterable[str]) -> str | None:
    wanted = {w.lower() for w in wanted}
    for child in item:
        if _local(child.tag).lower() in wanted:
            if child.text:
                return child.text.strip()
    return None


def _split_title_author(title: str) -> tuple[str, str]:
    # Many feeds format title as: "Book Title by Author"
    if " by " in title:
        t, a = title.rsplit(" by ", 1)
        return t.strip(), a.strip()
    return title.strip(), ""


def parse_goodreads_rss(xml_text: str, default_shelf: str | None = None) -> list[GoodreadsRssItem]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        raise ValueError(f"Invalid RSS XML: {e}")

    items: list[GoodreadsRssItem] = []

    # RSS can be rss/channel/item OR feed/entry (be tolerant)
    for node in root.iter():
        if _local(node.tag).lower() in {"item", "entry"}:
            title = _child_text(node, ["book_title", "title"]) or ""
            author = _child_text(node, ["author_name", "creator", "dc:creator"]) or ""
            guid = _child_text(node, ["guid", "book_id", "id"])  # prefer stable ID

            isbn = normalize_isbn(_child_text(node, ["isbn"]))
            isbn13 = normalize_isbn(_child_text(node, ["isbn13"]))
            asin = normalize_isbn(_child_text(node, ["asin"]))

            # If title exists but author doesn't, attempt split fallback
            if title and not author:
                t2, a2 = _split_title_author(title)
                title, author = t2, (author or a2)

            if not title:
                # Skip empty items instead of crashing
                continue

            items.append(
                GoodreadsRssItem(
                    external_id=(guid.strip() if guid else None),
                    title=title.strip(),
                    author=author.strip() or "Unknown",
                    isbn10=isbn if isbn and len(isbn) <= 10 else None,
                    isbn13=isbn13 if isbn13 else (isbn if isbn and len(isbn) == 13 else None),
                    asin=asin,
                    shelf=default_shelf,
                )
            )

    return items


def normalize_rss_input_url(rss_url_or_path: str) -> str:
    s = (rss_url_or_path or "").strip()
    if not s:
        raise ValueError("RSS URL is required")

    # Full URL
    if s.startswith("http://") or s.startswith("https://"):
        u = urlparse(s)
        if not u.scheme or not u.netloc:
            raise ValueError("Invalid RSS URL")
        return s

    # Treat as path relative to base
    base = settings.goodreads_base_url.rstrip("/") + "/"
    return urljoin(base, s.lstrip("/"))


async def fetch_rss(url: str) -> str:
    timeout = float(settings.goodreads_fetch_timeout_secs)
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": settings.user_agent},
    ) as client:
        res = await client.get(url)
        res.raise_for_status()
        return res.text
