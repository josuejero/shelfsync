from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.config import settings
from jose import jwt
from passlib.context import CryptContext  # type: ignore[import-untyped]

# Support legacy PBKDF2 hashes for login migration, but always *create* bcrypt hashes.
pwd_context = CryptContext(
    schemes=["bcrypt", "pbkdf2_sha256"],
    deprecated="auto",
)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def password_needs_rehash(hashed_password: str) -> bool:
    # True when the stored hash uses a deprecated scheme/params (e.g., pbkdf2_sha256).
    return pwd_context.needs_update(hashed_password)


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.auth_access_token_ttl_minutes)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {"sub": subject, "exp": expire}
    return jwt.encode(
        to_encode, settings.auth_secret_key, algorithm=settings.auth_algorithm
    )


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token, settings.auth_secret_key, algorithms=[settings.auth_algorithm]
    )
