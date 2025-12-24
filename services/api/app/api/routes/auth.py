from __future__ import annotations

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.auth import LoginIn, SignUpIn, UserOut
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

router = APIRouter(prefix="/auth", tags=["auth"])
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "password"
DEMO_ALLOWED_PASSWORDS = {DEMO_PASSWORD, "password123"}


def _should_auto_create_demo(payload: LoginIn) -> bool:
    return (
        settings.env == "local"
        and payload.email.lower() == DEMO_EMAIL
        and payload.password in DEMO_ALLOWED_PASSWORDS
    )


@router.post("/signup", response_model=UserOut)
def signup(payload: SignUpIn, response: Response, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()  # assigns user.id

    # Create default settings row now so later phases can rely on it.
    db.add(UserSettings(user_id=user.id, preferred_formats=["ebook"]))

    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.id)
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=settings.auth_access_token_ttl_minutes * 60,
        path="/",
    )

    return user


@router.post("/login", response_model=UserOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    demo_login = _should_auto_create_demo(payload)
    if not user:
        if demo_login:
            user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD))
            db.add(user)
            db.flush()  # assigns user.id
            db.add(UserSettings(user_id=user.id, preferred_formats=["ebook"]))
            db.commit()
            db.refresh(user)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
            )
    elif not verify_password(payload.password, user.password_hash):
        if demo_login and user.email.lower() == DEMO_EMAIL:
            user.password_hash = hash_password(DEMO_PASSWORD)
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
            )

    token = create_access_token(subject=user.id)
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        max_age=settings.auth_access_token_ttl_minutes * 60,
        path="/",
    )

    return user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=settings.auth_cookie_name, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user
