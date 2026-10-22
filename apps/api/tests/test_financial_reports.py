"""Test for Admin Financial Reports & Reconciliation endpoint.

Chạy:
    docker exec defense-api pytest tests/test_financial_reports.py -v
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

import psycopg2
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core import database as app_db  # noqa: E402


def _conn():
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


def _create_user_with_role(role_name: str) -> int:
    suffix = uuid.uuid4().hex[:12]
    email = f"test-{suffix}@pytest.local"
    username = f"pytest-{suffix}"

    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
            VALUES (%s, %s, %s, %s, 1, now(), 'email', '{}')
            RETURNING id
            """,
            (username, email, "x", f"Test {role_name}"),
        )
        user_id = cur.fetchone()[0]

        cur.execute("SELECT id FROM roles WHERE name = %s", (role_name,))
        role_row = cur.fetchone()
        if not role_row:
            cur.execute("INSERT INTO roles (name) VALUES (%s) RETURNING id", (role_name,))
            role_id = cur.fetchone()[0]
        else:
            role_id = role_row[0]

        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user_id, role_id),
        )
        conn.commit()
    return user_id


def _cleanup_user(user_id: int):
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM payment_orders WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM wallets WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()


def _make_token(user_id: int, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


@pytest.mark.asyncio
async def test_financial_reports_requires_admin(client: AsyncClient):
    student_id = _create_user_with_role("student")
    try:
        token = _make_token(student_id, "student")
        resp = await client.get(
            "/api/admin/financial-reports",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
    finally:
        _cleanup_user(student_id)


@pytest.mark.asyncio
async def test_financial_reports_admin_success(client: AsyncClient):
    admin_id = _create_user_with_role("admin")
    student_id = _create_user_with_role("student")

    # Insert test payment orders
    with _conn() as conn, conn.cursor() as cur:
        order_code = f"DEF_TEST_{uuid.uuid4().hex[:8]}"
        cur.execute(
            """
            INSERT INTO payment_orders (order_code, user_id, purpose, cycle, amount, method, status, provider_reference, created_at, paid_at)
            VALUES (%s, %s, 'subscription', 'monthly', 199000, 'payos', 'paid', 'POS_TEST_99', now(), now())
            """,
            (order_code, student_id),
        )
        conn.commit()

    try:
        token = _make_token(admin_id, "admin")
        resp = await client.get(
            "/api/admin/financial-reports",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "summary" in data
        assert data["summary"]["total_gross_revenue"] >= 199000
        assert "by_method" in data
        assert "timeline" in data
        assert "transactions" in data
        assert any(t["order_code"] == order_code for t in data["transactions"])

        # Test overview reflects total_revenue
        overview_resp = await client.get(
            "/api/admin/overview",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert overview_resp.status_code == 200
        ov = overview_resp.json()
        assert ov["total_revenue"] >= 199000
    finally:
        _cleanup_user(student_id)
        _cleanup_user(admin_id)
