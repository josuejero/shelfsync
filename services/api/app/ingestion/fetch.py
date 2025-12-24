from __future__ import annotations

from urllib.parse import urlparse, urlunparse

import httpx

from app.core.config import settings


def _rewrite_goodreads_url(url: str, base_url: str | None) -> str:
    if not base_url:
        return url

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if not hostname or not (hostname == "goodreads.com" or hostname.endswith(".goodreads.com")):
        return url

    base = urlparse(base_url)
    if not base.scheme or not base.netloc:
        return url

    base_path = base.path.rstrip("/")
    incoming_path = parsed.path or "/"
    merged_path = f"{base_path}{incoming_path}" if base_path else incoming_path

    rewritten = parsed._replace(scheme=base.scheme, netloc=base.netloc, path=merged_path)
    return urlunparse(rewritten)


async def fetch_text(url: str) -> str:
    request_url = _rewrite_goodreads_url(url, settings.goodreads_base_url)
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.get(request_url, headers={"User-Agent": "ShelfSync/0.1"})
        resp.raise_for_status()
        return resp.text
