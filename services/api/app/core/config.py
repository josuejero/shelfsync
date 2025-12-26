from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# services/api/app/core/config.py -> BASE_DIR == services/api
BASE_DIR = Path(__file__).resolve().parents[2]
APP_DIR = BASE_DIR / "app"
DEFAULT_FIXTURE_CATALOG_PATH = APP_DIR / "fixtures" / "catalog_fixture.json"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        extra="ignore",
        env_prefix="",
        case_sensitive=False,
    )

    # Environment
    env: str = Field(default="dev", validation_alias="ENV")

    # Application
    api_name: str = Field(default="shelfsync-api", validation_alias="API_NAME")
    log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")
    user_agent: str = Field(default="ShelfSync/0.1", validation_alias="USER_AGENT")

    # Database & cache
    database_url: str = Field(
        default="sqlite+pysqlite:///./shelfsync.db",
        validation_alias="DATABASE_URL",
    )
    test_database_url: str | None = Field(
        default=None, validation_alias="TEST_DATABASE_URL"
    )
    redis_url: str = Field(
        default="redis://localhost:6379/0", validation_alias="REDIS_URL"
    )
    availability_cache_ttl_secs: int = Field(
        default=300, validation_alias="AVAILABILITY_CACHE_TTL_SECS"
    )

    # Goodreads / ingestion
    goodreads_base_url: str | None = Field(
        default=None, validation_alias="GOODREADS_BASE_URL"
    )
    goodreads_fetch_timeout_secs: float = Field(
        default=15.0, validation_alias="GOODREADS_FETCH_TIMEOUT_SECS"
    )

    # Auth
    auth_secret_key: str = Field(
        default="dev-secret-key", validation_alias="AUTH_SECRET_KEY"
    )
    auth_algorithm: str = Field(default="HS256", validation_alias="AUTH_ALGORITHM")
    auth_access_token_ttl_minutes: int = Field(
        default=60, validation_alias="AUTH_ACCESS_TOKEN_TTL_MINUTES"
    )
    auth_cookie_name: str = Field(
        default="shelfsync_auth", validation_alias="AUTH_COOKIE_NAME"
    )
    auth_cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax", validation_alias="AUTH_COOKIE_SAMESITE"
    )
    auth_cookie_secure: bool = Field(
        default=False, validation_alias="AUTH_COOKIE_SECURE"
    )

    @field_validator("auth_cookie_samesite", mode="before")
    @classmethod
    def normalize_cookie_samesite(cls, v: Any) -> Literal["lax", "strict", "none"]:
        if v is None:
            return "lax"
        if not isinstance(v, str):
            raise TypeError("AUTH_COOKIE_SAMESITE must be a string")
        s = v.strip().lower()
        if s not in {"lax", "strict", "none"}:
            raise ValueError("AUTH_COOKIE_SAMESITE must be one of: lax, strict, none")
        return s  # type: ignore[return-value]

    # Demo mode
    demo_seed_email: str = Field(
        default="demo@shelfsync.app", validation_alias="DEMO_SEED_EMAIL"
    )
    demo_seed_password: str = Field(
        default="demo", validation_alias="DEMO_SEED_PASSWORD"
    )
    demo_login_enabled: bool = Field(
        default=True, validation_alias="DEMO_LOGIN_ENABLED"
    )

    # CORS
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        validation_alias="CORS_ORIGINS",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        """
        Supported env formats:
          - JSON list: '["http://localhost:3000"]'
          - Bracket list (no quotes): '[http://localhost:3000, http://localhost:5173]'
          - Comma-separated: 'http://localhost:3000, http://localhost:5173'
          - '*' wildcard
        """
        if v is None:
            return []
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if not isinstance(v, str):
            raise TypeError("cors_origins must be a string or list of strings")

        s = v.strip()
        if not s:
            return []
        if s == "*":
            return ["*"]

        # Try JSON first for strings that look like JSON arrays
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed if str(x).strip()]
            except json.JSONDecodeError:
                # Not JSON, treat as a simple bracket list without quotes
                inner = s[1:-1].strip()
                if not inner:
                    return []
                parts = [p.strip().strip('"').strip("'") for p in inner.split(",")]
                return [p for p in parts if p]

        # Comma-separated list
        parts = [p.strip() for p in s.split(",")]
        return [p for p in parts if p]

    # Catalog provider
    catalog_provider: str = Field(
        default="fixture", validation_alias="CATALOG_PROVIDER"
    )
    fixture_catalog_path: str = Field(
        default=str(DEFAULT_FIXTURE_CATALOG_PATH),
        validation_alias="FIXTURE_CATALOG_PATH",
    )
    google_books_api_key: str | None = Field(
        default=None, validation_alias="GOOGLE_BOOKS_API_KEY"
    )

    # Rate limiting
    rate_limit_window_seconds: int = Field(
        default=60, validation_alias="RATE_LIMIT_WINDOW_SECONDS"
    )
    rate_limit_books_per_window: int = Field(
        default=30, validation_alias="RATE_LIMIT_BOOKS_PER_WINDOW"
    )
    rate_limit_dashboard_per_window: int = Field(
        default=10, validation_alias="RATE_LIMIT_DASHBOARD_PER_WINDOW"
    )

    # Backwards-compat alias for older call sites
    @property
    def rate_limit_window_secs(self) -> int:
        return self.rate_limit_window_seconds

    # Workers
    worker_job_timeout_secs: int = Field(
        default=30, validation_alias="WORKER_JOB_TIMEOUT_SECS"
    )

    # OpenTelemetry
    otel_enabled: bool = Field(default=False, validation_alias="OTEL_ENABLED")
    otel_otlp_endpoint: str = Field(
        default="http://localhost:4317",
        validation_alias="OTEL_OTLP_ENDPOINT",
    )


settings = Settings()
