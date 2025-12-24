from __future__ import annotations

import importlib
from typing import Any, Literal

from pydantic import Field

PydanticBaseSettings: Any
PydanticSettingsConfigDict: Any
_BaseSettings: Any
_SettingsConfigDict: Any

try:
    pydantic_settings = importlib.import_module("pydantic_settings")
    _BaseSettings = pydantic_settings.BaseSettings
    _SettingsConfigDict = pydantic_settings.SettingsConfigDict
    _USE_PYDANTIC_SETTINGS = True
except ModuleNotFoundError:  # pragma: no cover - runtime fallback
    try:
        pydantic = importlib.import_module("pydantic")
    except Exception as exc:  # pragma: no cover - defensive
        raise ModuleNotFoundError(
            "pydantic-settings is required with pydantic v2; install it or downgrade to pydantic v1."
        ) from exc

    _BaseSettings = pydantic.BaseSettings
    _SettingsConfigDict = None
    _USE_PYDANTIC_SETTINGS = False

PydanticBaseSettings = _BaseSettings
PydanticSettingsConfigDict = _SettingsConfigDict


class Settings(PydanticBaseSettings):
    if _USE_PYDANTIC_SETTINGS:
        model_config = PydanticSettingsConfigDict(
            env_file=".env",
            env_file_encoding="utf-8",
            extra="ignore",
            case_sensitive=False,
        )
    else:

        class Config:
            env_file = ".env"
            env_file_encoding = "utf-8"
            extra = "ignore"
            case_sensitive = False

    # Environment
    env: str = Field(default="local", validation_alias="ENV")

    # API
    api_name: str = Field(default="ShelfSync API", validation_alias="API_NAME")

    # Observability
    otel_enabled: bool = Field(default=False, validation_alias="OTEL_ENABLED")

    # Backing services
    database_url: str = Field(
        default="postgresql+psycopg2://shelfsync:shelfsync@localhost:5432/shelfsync",
        validation_alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")
    goodreads_base_url: str | None = Field(default=None, validation_alias="GOODREADS_BASE_URL")
    goodreads_fetch_timeout_secs: int = Field(
        default=10, validation_alias="GOODREADS_FETCH_TIMEOUT_SECS"
    )
    user_agent: str = Field(default="ShelfSync/0.1", validation_alias="USER_AGENT")

    # CORS
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"], validation_alias="CORS_ORIGINS"
    )

    # Auth
    auth_secret_key: str = Field(default="CHANGE_ME_IN_PROD", validation_alias="AUTH_SECRET_KEY")
    auth_access_token_ttl_minutes: int = Field(
        default=60 * 24 * 7, validation_alias="AUTH_ACCESS_TOKEN_TTL_MINUTES"
    )

    # Cookies
    auth_cookie_name: str = Field(default="access_token", validation_alias="AUTH_COOKIE_NAME")
    auth_cookie_secure: bool = Field(default=False, validation_alias="AUTH_COOKIE_SECURE")
    auth_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax",
        validation_alias="AUTH_COOKIE_SAMESITE",
    )
    # Catalog provider
    catalog_provider: str = Field(default="fixture", validation_alias="CATALOG_PROVIDER")
    fixture_catalog_path: str = Field(
        default="app/fixtures/catalog_fixture.json",
        validation_alias="FIXTURE_CATALOG_PATH",
    )
    availability_cache_ttl_secs: int = Field(
        default=300, validation_alias="AVAILABILITY_CACHE_TTL_SECS"
    )
    rate_limit_window_secs: int = Field(default=60, validation_alias="RATE_LIMIT_WINDOW_SECS")
    rate_limit_dashboard_per_window: int = Field(
        default=30, validation_alias="RATE_LIMIT_DASHBOARD_PER_WINDOW"
    )
    rate_limit_books_per_window: int = Field(
        default=60, validation_alias="RATE_LIMIT_BOOKS_PER_WINDOW"
    )


settings = Settings()
