"""Test đăng ký tài khoản kèm NGÀNH HỌC (users.major) — KHÔNG CẦN UI.

Chạy:
    cd apps/api && pytest tests/test_register_major.py -v --capture=no

Cách hoạt động:
- Gọi POST /api/auth/register qua httpx.AsyncClient + ASGITransport (in-process,
  không cần server chạy, không gọi mạng ngoài).
- DB thật (DATABASE_URL trong .env — Postgres localhost:5433) — user tạo ra
  được cleanup ở finally.

4 kịch bản:
1. Major hợp lệ (từ VALID_MAJORS) → 200, lưu đúng vào DB, trả về trong
   response ĐĂNG KÝ lẫn GET /api/auth/me.
2. Major lạ (không nằm trong danh sách) → 422 kèm thông báo tiếng Việt.
3. Không gửi major → 200, major = NULL (tương thích user cũ).
4. Major rỗng "" → coi như không chọn, 200, major = NULL.
"""
import os
import socket
import sys
import uuid

import psycopg2
import psycopg2.extras
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# Tự động nhận diện host: nếu chạy ngoài container và không phân giải được 'db', fallback localhost:5433
if "DATABASE_URL" not in os.environ:
    try:
        socket.gethostbyname("db")
    except socket.gaierror:
        os.environ["DATABASE_URL"] = (
            "postgresql+asyncpg://postgres:postgres@localhost:5433/defense_db"
        )

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app  # noqa: E402
from app.core import database as app_db  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.schemas.user import VALID_MAJORS  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers (psycopg2 sync — giống test_auth_google.py)
# ---------------------------------------------------------------------------

def _conn():
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _find_user_by_email(email: str):
    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        row = cur.fetchone()
        return row["id"] if row else None


def _get_major(user_id: int):
    """Đọc cột major trực tiếp từ DB (nguồn chân lý)."""
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT major FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        return row[0] if row else None


def _cleanup_user(user_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM refresh_tokens WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


def _register_payload(email: str, **extra) -> dict:
    return {
        "email": email,
        "password": "DefendAI@123",
        "full_name": "Pytest Major User",
        **extra,
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
async def test_register_with_valid_major_saves_and_returns(client):
    """Kịch bản 1: major hợp lệ → 200, lưu đúng DB, trả về ở register + /me."""
    email = f"pytest-major-{uuid.uuid4().hex[:10]}@gmail.com"
    major = VALID_MAJORS[0]  # "Công nghệ thông tin / Khoa học máy tính"
    created_id = None
    try:
        r = await client.post("/api/auth/register", json=_register_payload(email, major=major))

        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["email"] == email
        assert data["user"]["major"] == major

        # DB phải lưu đúng giá trị
        created_id = _find_user_by_email(email)
        assert created_id is not None
        assert _get_major(created_id) == major

        # GET /api/auth/me (UserResponse.from_user) cũng phải trả major
        me = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {data['token']}"}
        )
        assert me.status_code == 200, me.text
        assert me.json()["major"] == major
    finally:
        if created_id:
            _cleanup_user(created_id)


@pytest.mark.asyncio
async def test_register_with_unknown_major_422(client):
    """Kịch bản 2: major lạ không nằm trong VALID_MAJORS → 422 + thông báo tiếng Việt."""
    email = f"pytest-major-bad-{uuid.uuid4().hex[:10]}@gmail.com"
    try:
        r = await client.post(
            "/api/auth/register",
            json=_register_payload(email, major="Thần học So sánh"),
        )

        assert r.status_code == 422
        assert "Ngành học không hợp lệ" in r.text

        # Validation fail trước handler → không tạo user rác trong DB
        assert _find_user_by_email(email) is None
    finally:
        created_id = _find_user_by_email(email)
        if created_id:
            _cleanup_user(created_id)


@pytest.mark.asyncio
async def test_register_without_major_still_ok(client):
    """Kịch bản 3: không gửi major → 200, major = NULL (tương thích user cũ)."""
    email = f"pytest-major-none-{uuid.uuid4().hex[:10]}@gmail.com"
    created_id = None
    try:
        r = await client.post("/api/auth/register", json=_register_payload(email))

        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["major"] is None

        created_id = _find_user_by_email(email)
        assert created_id is not None
        assert _get_major(created_id) is None
    finally:
        if created_id:
            _cleanup_user(created_id)


@pytest.mark.asyncio
async def test_register_empty_major_treated_as_missing(client):
    """Kịch bản 4: major rỗng/whitespace → coi như không chọn, 200, major = NULL."""
    email = f"pytest-major-empty-{uuid.uuid4().hex[:10]}@gmail.com"
    created_id = None
    try:
        r = await client.post(
            "/api/auth/register", json=_register_payload(email, major="   ")
        )

        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["user"]["major"] is None

        created_id = _find_user_by_email(email)
        assert created_id is not None
        assert _get_major(created_id) is None
    finally:
        if created_id:
            _cleanup_user(created_id)
