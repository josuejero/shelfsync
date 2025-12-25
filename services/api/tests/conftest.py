import os

import pytest
from app.db.session import get_db
from app.main import app
from app.models import Base
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture(scope="session")
def engine():
    # Prefer a dedicated Postgres DB for realism.
    # Override at runtime: DATABASE_URL=... pytest
    url = os.getenv("DATABASE_URL")
    if url:
        eng = create_engine(url, pool_pre_ping=True)
    else:
        # Default to in-memory SQLite so tests run without external services.
        eng = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

    # For speed, create tables directly in tests.
    # In CI, consider running `alembic upgrade head` and omitting create_all.
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture()
def db_session(engine):
    connection = engine.connect()
    tx = connection.begin()

    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=connection
    )
    session = TestingSessionLocal()

    try:
        yield session
    finally:
        session.close()
        tx.rollback()
        connection.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
