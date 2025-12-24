def test_signup_sets_cookie_and_returns_user(client):
    resp = client.post(
        "/v1/auth/signup", json={"email": "a@example.com", "password": "password123"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "a@example.com"
    assert "set-cookie" in resp.headers


def test_login_and_me(client):
    client.post("/v1/auth/signup", json={"email": "b@example.com", "password": "password123"})

    # logout to clear cookie
    client.post("/v1/auth/logout")

    resp = client.post("/v1/auth/login", json={"email": "b@example.com", "password": "password123"})
    assert resp.status_code == 200

    me = client.get("/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "b@example.com"


def test_me_requires_auth(client):
    resp = client.get("/v1/auth/me")
    assert resp.status_code in (401, 403)


def test_login_rejects_bad_password(client):
    client.post("/v1/auth/signup", json={"email": "c@example.com", "password": "password123"})
    resp = client.post("/v1/auth/login", json={"email": "c@example.com", "password": "wrongwrong"})
    assert resp.status_code in (401, 403)


def test_login_accepts_legacy_pbkdf2_hash(client, db_session):
    from app.models.user import User
    from passlib.context import CryptContext

    legacy_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    db_session.add(
        User(email="legacy@example.com", password_hash=legacy_context.hash("password123"))
    )
    db_session.flush()

    resp = client.post(
        "/v1/auth/login", json={"email": "legacy@example.com", "password": "password123"}
    )
    assert resp.status_code == 200


def test_login_auto_creates_demo_user(client):
    resp = client.post(
        "/v1/auth/login", json={"email": "demo@example.com", "password": "password123"}
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "demo@example.com"


def test_login_auto_creates_demo_user_with_simple_password(client):
    resp = client.post("/v1/auth/login", json={"email": "demo@example.com", "password": "password"})
    assert resp.status_code == 200
    assert resp.json()["email"] == "demo@example.com"
