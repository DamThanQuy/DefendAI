"""Test Google login/sign-up KHÔNG CẦN UI.

Chạy:
    cd apps/api && pytest tests/test_auth_google.py -v --capture=no

Cách hoạt động:
- Mock `google.oauth2.id_token.verify_oauth2_token` (hàm mà router auth.py gọi
  trong try-block) → trả về payload giả {sub, email, name} như Google thật.
- Gọi POST /api/auth/google qua httpx.AsyncClient + ASGITransport (không cần
  browser, không cần FE, không cần Google account thật).
- DB thật (DATABASE_URL trong .env) — user tạo ra được cleanup ở finally.

3 kịch bản:
1. Token hợp lệ + email chưa tồn tại → SIGN-UP (tạo user mới, role student).
2. Token hợp lệ + user email/password cũ chưa link Google → LINK google_sub.
3. Token không verify được (mock raise) → 401.
"""
import os
import sys
import uuid
from unittest.mock import patch

import psycopg2
import psycopg2.extras
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core import database as app_db  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers (psycopg2 sync — giống test_documents_softdelete.py)
# ---------------------------------------------------------------------------

def _conn():
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _create_email_user(email: str) -> int:
    """Tạo user email/password cũ (chưa có google_sub)."""
    suffix = uuid.uuid4().hex[:10]
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
            VALUES (%s, %s, %s, %s, 1, now(), 'email', '{}'::jsonb)
            RETURNING id
            """,
            (f"pytest-{suffix}", email, "x", "Pytest User"),
        )
        user_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM roles WHERE name = 'student'")
        role_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user_id, role_id),
        )
    return user_id


def _get_user(user_id: int) -> dict:
    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT id, email, google_sub, auth_provider FROM users WHERE id = %s",
            (user_id,),
        )
        return dict(cur.fetchone())


def _find_user_by_email(email: str):
    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        return row["id"] if row else None


def _cleanup_user(user_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM refresh_tokens WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


def _fake_google_payload(email: str, sub: str | None = None) -> dict:
    """Payload giống hệt những gì verify_oauth2_token của Google trả về."""
    return {
        "iss": "accounts.google.com",
        "aud": settings.google_client_id,
        "sub": sub or f"google-{uuid.uuid4().hex[:16]}",
        "email": email,
        "email_verified": True,
        "name": "Pytest Google User",
    }


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_google_signup_creates_new_user(client):
    """Kịch bản 1: email chưa tồn tại → tạo user mới (sign-up), role student."""
    email = f"pytest-gg-{uuid.uuid4().hex[:10]}@gmail.com"
    payload = _fake_google_payload(email)
    created_id = None
    try:
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
            r = await client.post("/api/auth/google", json={"id_token": "fake-token"})

        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["token"] and data["refresh_token"]
        assert data["user"]["email"] == email
        assert data["user"]["roles"] == ["student"]
        assert data["user"]["full_name"] == "Pytest Google User"

        created_id = _find_user_by_email(email)
        assert created_id is not None
        row = _get_user(created_id)
        assert row["google_sub"] == payload["sub"]
        assert row["auth_provider"] == "google"
    finally:
        if created_id:
            _cleanup_user(created_id)


@pytest.mark.asyncio
async def test_google_login_links_existing_email_user(client):
    """Kịch bản 2: user email/password cũ → link google_sub, không tạo user mới."""
    email = f"pytest-link-{uuid.uuid4().hex[:10]}@gmail.com"
    user_id = _create_email_user(email)
    try:
        payload = _fake_google_payload(email)
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
            r = await client.post("/api/auth/google", json={"id_token": "fake-token"})

        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["id"] == user_id  # đúng user cũ, không tạo mới
        assert data["token"]

        row = _get_user(user_id)
        assert row["google_sub"] == payload["sub"]
        assert row["auth_provider"] == "google"
    finally:
        _cleanup_user(user_id)


@pytest.mark.asyncio
async def test_google_login_second_time_returns_same_user(client):
    """Kịch bản 2b: login lần 2 với cùng sub → vẫn 1 user (login thường)."""
    email = f"pytest-relogin-{uuid.uuid4().hex[:10]}@gmail.com"
    payload = _fake_google_payload(email)
    created_id = None
    try:
        with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
            r1 = await client.post("/api/auth/google", json={"id_token": "fake-token"})
            r2 = await client.post("/api/auth/google", json={"id_token": "fake-token"})

        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["user"]["id"] == r2.json()["user"]["id"]
        created_id = r1.json()["user"]["id"]
    finally:
        if created_id:
            _cleanup_user(created_id)


@pytest.mark.asyncio
async def test_google_login_invalid_token_401(client):
    """Kịch bản 3: Google verify fail → 401 'Google token không hợp lệ'."""
    with patch(
        "google.oauth2.id_token.verify_oauth2_token",
        side_effect=ValueError("Invalid token"),
    ):
        r = await client.post("/api/auth/google", json={"id_token": "bad-token"})

    assert r.status_code == 401
    assert r.json()["detail"] == "Google token không hợp lệ"


@pytest.mark.asyncio
async def test_google_login_token_without_email_400(client):
    """Kịch bản 4: token hợp lệ nhưng không có email → 400."""
    payload = _fake_google_payload("x@y.z")
    del payload["email"]
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
        r = await client.post("/api/auth/google", json={"id_token": "fake-token"})

    assert r.status_code == 400
    assert "email" in r.json()["detail"].lower()
