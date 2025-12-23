from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import settings
from jose import jwt  # type: ignore[import-untyped]
from passlib.context import CryptContext  # type: ignore[import-untyped]


def _build_password_context() -> CryptContext:
    preferred = CryptContext(schemes=["bcrypt"], deprecated="auto")
    try:
        preferred.hash("bcrypt-healthcheck")
    except Exception:
        return CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    return preferred


pwd_context = _build_password_context()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(*, subject: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.auth_access_token_ttl_minutes)
    payload = {"sub": subject, "exp": expires}
    return jwt.encode(payload, settings.auth_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.auth_secret_key, algorithms=[ALGORITHM])
