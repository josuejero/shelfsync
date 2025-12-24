from __future__ import annotations

from functools import lru_cache

from app.core.config import settings
from app.services.catalog.fixture_provider import FixtureProvider
from app.services.catalog.overdrive_provider import OverDriveProvider
from app.services.catalog.provider import CatalogProvider


@lru_cache
def get_provider() -> CatalogProvider:
    if settings.catalog_provider == "fixture":
        return FixtureProvider(fixture_path=settings.fixture_catalog_path)
    if settings.catalog_provider == "overdrive":
        return OverDriveProvider()
    raise ValueError(f"Unknown catalog provider: {settings.catalog_provider}")
