from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.models import Base


def _guess_test_database_url() -> str:
    """Prefer TEST_DATABASE_URL; fall back to DATABASE_URL; if Postgres, append _test."""
    test_url = os.getenv("TEST_DATABASE_URL")
    if test_url:
        return test_url

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        return "sqlite+pysqlite:///:memory:"

    if db_url.endswith("_test") or "shelfsync_test" in db_url:
        return db_url

    if db_url.startswith("postgresql") and "/" in db_url.rsplit("@", 1)[-1]:
        prefix, dbname = db_url.rsplit("/", 1)
        if dbname:
            return f"{prefix}/{dbname}_test"

    return db_url


_TEST_DB_URL = _guess_test_database_url()
os.environ.setdefault("DATABASE_URL", _TEST_DB_URL)


def _alembic_cfg(db_url: str) -> Config:
    base_dir = Path(__file__).resolve().parents[1]  # services/api
    alembic_ini = base_dir / "alembic.ini"
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("sqlalchemy.url", db_url)
    return cfg


def _truncate_all_tables(engine) -> None:
    """Delete rows from every model table so tests always start clean."""
    with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            conn.execute(text("PRAGMA foreign_keys = OFF"))

        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())

        if engine.dialect.name == "sqlite":
            conn.execute(text("PRAGMA foreign_keys = ON"))


@pytest.fixture(scope="session")
def engine():
    url = _TEST_DB_URL

    if url.startswith("sqlite"):
        from sqlalchemy.pool import StaticPool

        eng = create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        eng = create_engine(url, pool_pre_ping=True)

    connection = eng.connect()
    cfg = _alembic_cfg(url)
    cfg.attributes["connection"] = connection
    try:
        command.upgrade(cfg, "head")
    finally:
        connection.close()

    yield eng
    eng.dispose()


@pytest.fixture()
def db_session(engine) -> Generator[Session, None, None]:
    _truncate_all_tables(engine)
    connection = engine.connect()
    transaction = connection.begin()

    TestingSessionLocal = sessionmaker(
        bind=connection, autoflush=False, autocommit=False
    )
    session: Session = TestingSessionLocal()

    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess: Session, trans) -> None:  # type: ignore[no-redef]
        if (
            trans.nested and not trans._parent.nested
        ):  # pyright: ignore[reportPrivateUsage]
            sess.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    from app.db.session import get_db
    from app.main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
