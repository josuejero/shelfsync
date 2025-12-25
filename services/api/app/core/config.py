from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    env: str = Field(default="local", validation_alias="ENV")
    api_name: str = Field(default="ShelfSync API", validation_alias="API_NAME")

    database_url: str = Field(
        default="sqlite:///./app.db", validation_alias="DATABASE_URL"
    )
    redis_url: str = Field(
        default="redis://localhost:6379/0", validation_alias="REDIS_URL"
    )

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        validation_alias="CORS_ORIGINS",
    )

    auth_secret_key: str = Field(
        default="dev-secret", validation_alias="AUTH_SECRET_KEY"
    )
    auth_algorithm: str = Field(default="HS256", validation_alias="AUTH_ALGORITHM")
    auth_access_token_ttl_minutes: int = Field(
        default=60 * 24 * 7, validation_alias="AUTH_ACCESS_TOKEN_TTL_MINUTES"
    )

    auth_cookie_name: str = Field(
        default="shelfsync_token", validation_alias="AUTH_COOKIE_NAME"
    )
    auth_cookie_secure: bool = Field(
        default=False, validation_alias="AUTH_COOKIE_SECURE"
    )
    auth_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax", validation_alias="AUTH_COOKIE_SAMESITE"
    )

    demo_login_enabled: bool = Field(
        default=False, validation_alias="DEMO_LOGIN_ENABLED"
    )
    demo_seed_enabled: bool = Field(default=False, validation_alias="DEMO_SEED_ENABLED")

    goodreads_base_url: str = Field(
        default="https://www.goodreads.com", validation_alias="GOODREADS_BASE_URL"
    )
    goodreads_fetch_timeout_secs: int = Field(
        default=15, validation_alias="GOODREADS_FETCH_TIMEOUT_SECS"
    )
    user_agent: str = Field(default="ShelfSync/0.1", validation_alias="USER_AGENT")

    catalog_provider: str = Field(
        default="fixture", validation_alias="CATALOG_PROVIDER"
    )
    fixture_catalog_path: str = Field(
        default="app/fixtures/catalog_fixture.json",
        validation_alias="FIXTURE_CATALOG_PATH",
    )

    availability_cache_ttl_secs: int = Field(
        default=300, validation_alias="AVAILABILITY_CACHE_TTL_SECS"
    )

    rate_limit_window_secs: int = Field(
        default=60, validation_alias="RATE_LIMIT_WINDOW_SECS"
    )
    rate_limit_books_per_window: int = Field(
        default=120, validation_alias="RATE_LIMIT_BOOKS_PER_WINDOW"
    )
    rate_limit_dashboard_per_window: int = Field(
        default=60, validation_alias="RATE_LIMIT_DASHBOARD_PER_WINDOW"
    )

    worker_job_timeout_secs: int = Field(
        default=600, validation_alias="WORKER_JOB_TIMEOUT_SECS"
    )

    otel_enabled: bool = Field(default=False, validation_alias="OTEL_ENABLED")
    otel_otlp_endpoint: str | None = Field(
        default=None, validation_alias="OTEL_OTLP_ENDPOINT"
    )


settings = Settings()
