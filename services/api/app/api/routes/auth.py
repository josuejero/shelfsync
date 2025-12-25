from __future__ import annotations

from datetime import timedelta

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import (
    create_access_token,
    hash_password,
    password_needs_rehash,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.auth import LoginIn, SignUpIn, UserOut
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/v1/auth", tags=["auth"])

DEMO_EMAIL = "demo@example.com"


def _get_user_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def _ensure_user_settings(db: Session, user_id: str) -> None:
    existing = db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    ).scalar_one_or_none()
    if existing is None:
        db.add(UserSettings(user_id=user_id))
        db.flush()


def _create_user(db: Session, *, email: str, password: str) -> User:
    u = User(email=email, password_hash=hash_password(password))
    db.add(u)
    db.flush()
    _ensure_user_settings(db, u.id)
    db.commit()
    db.refresh(u)
    return u


def _update_user_password(db: Session, u: User, password: str) -> None:
    u.password_hash = hash_password(password)
    db.add(u)
    db.commit()
    db.refresh(u)


def _set_auth_cookie(response: Response, *, subject: str) -> None:
    token = create_access_token(
        subject=subject,
        expires_delta=timedelta(minutes=settings.auth_access_token_ttl_minutes),
    )
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        path="/",
    )


@router.post("/signup", response_model=UserOut)
def signup(payload: SignUpIn, response: Response, db: Session = Depends(get_db)):
    existing = _get_user_by_email(db, payload.email)
    if existing is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    u = _create_user(db, email=payload.email, password=payload.password)
    _set_auth_cookie(response, subject=u.id)
    return UserOut(id=u.id, email=u.email)


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    u = _get_user_by_email(db, payload.email)

    # Demo auto-create for local/dev if enabled
    if (
        u is None
        and settings.demo_login_enabled
        and settings.env in {"local", "development", "dev"}
    ):
        if payload.email == DEMO_EMAIL:
            u = _create_user(db, email=payload.email, password=payload.password)

    if u is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(payload.password, u.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # If this was a legacy hash, upgrade it automatically.
    if password_needs_rehash(u.password_hash):
        _update_user_password(db, u, payload.password)

    _set_auth_cookie(response, subject=u.id)
    return UserOut(id=u.id, email=u.email)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut(id=user.id, email=user.email)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(settings.auth_cookie_name, path="/")
    return {"ok": True}
