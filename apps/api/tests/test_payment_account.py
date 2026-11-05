"""Test gói mặc định của tài khoản mới và GET /api/payment/account — KHÔNG CẦN UI.

Chạy:
    cd apps/api && pytest tests/test_payment_account.py -v --capture=no

Cách hoạt động:
- Gọi API qua httpx.AsyncClient + ASGITransport (in-process, không gọi mạng ngoài).
- DB thật (DATABASE_URL trong .env — Postgres localhost:5433) — user tạo ra
  được cleanup ở finally.

3 kịch bản:
1. Tài khoản vừa đăng ký → không có subscription, không có membership (gói Free).
2. Membership free / thiếu plan / không active → không suy diễn thành gói trả phí.
3. Membership VIP / Premium active → trả đúng gói.
"""
import json
import os
import socket
import sys
import uuid

import psycopg2
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


def _conn():
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _set_profile_data(user_id: int, profile_data: dict) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE users SET profile_data = %s WHERE id = %s",
            (json.dumps(profile_data), user_id),
        )


def _count_subscriptions(user_id: int) -> int:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM subscriptions WHERE user_id = %s", (user_id,))
        return cur.fetchone()[0]


def _cleanup_user(user_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM refresh_tokens WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


async def _register(client: AsyncClient) -> tuple[int, dict]:
    """Đăng ký user mới, trả về (user_id, auth headers)."""
    email = f"pytest-plan-{uuid.uuid4().hex[:10]}@gmail.com"
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "DefendAI@123", "full_name": "Pytest Plan User"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return int(data["user"]["id"]), {"Authorization": f"Bearer {data['token']}"}


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


@pytest.mark.asyncio
async def test_new_account_has_no_paid_plan(client):
    """Kịch bản 1: tài khoản vừa đăng ký → gói Free, không có dấu vết gói trả phí."""
    user_id, headers = await _register(client)
    try:
        account = await client.get("/api/payment/account", headers=headers)
        assert account.status_code == 200, account.text
        assert account.json()["subscription"] is None

        me = await client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200, me.text
        assert "membership" not in me.json()["profile_data"]

        assert _count_subscriptions(user_id) == 0
    finally:
        _cleanup_user(user_id)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "membership",
    [
        {"plan": "free", "cycle": "monthly", "status": "active"},
        {"status": "active"},
        {"plan": "vip", "status": "inactive"},
        {"plan": "vip", "status": "active", "expires_at": "2020-01-01T00:00:00"},
    ],
    ids=["free-active", "missing-plan", "vip-inactive", "vip-expired"],
)
async def test_non_paid_membership_is_not_a_subscription(client, membership):
    """Kịch bản 2: membership không phải gói trả phí đang active → subscription = None."""
    user_id, headers = await _register(client)
    try:
        _set_profile_data(user_id, {"membership": membership})

        account = await client.get("/api/payment/account", headers=headers)
        assert account.status_code == 200, account.text
        assert account.json()["subscription"] is None
    finally:
        _cleanup_user(user_id)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan", "plan_name"),
    [("vip", "VIP"), ("premium", "Premium")],
)
async def test_paid_membership_is_returned(client, plan, plan_name):
    """Kịch bản 3: membership trả phí đang active → trả đúng gói."""
    user_id, headers = await _register(client)
    try:
        _set_profile_data(
            user_id,
            {
                "membership": {
                    "plan": plan,
                    "cycle": "monthly",
                    "status": "active",
                    "activated_at": "2026-11-01T00:00:00",
                    "expires_at": "2099-12-01T00:00:00",
                }
            },
        )

        account = await client.get("/api/payment/account", headers=headers)
        assert account.status_code == 200, account.text
        subscription = account.json()["subscription"]
        assert subscription["plan_id"] == plan
        assert subscription["plan_name"] == plan_name
        assert subscription["cycle"] == "monthly"
    finally:
        _cleanup_user(user_id)
