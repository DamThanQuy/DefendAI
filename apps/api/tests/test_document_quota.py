"""Unit & Integration tests for document upload quota enforcement."""
from datetime import datetime
import os
import sys
import uuid
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
import psycopg2
import psycopg2.extras
from sqlalchemy import select
from sqlalchemy.orm import selectinload

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core import database as app_db  # noqa: E402
from app.models.entities import User  # noqa: E402
from app.services.membership import get_document_quota, check_document_upload_quota  # noqa: E402
from fastapi import HTTPException  # noqa: E402


def _conn():
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _create_user(role_name: str = "student", profile_data: dict | None = None) -> int:
    suffix = uuid.uuid4().hex[:12]
    email = f"quota-{suffix}@pytest.local"
    username = f"quota-{suffix}"
    p_data = "{}" if profile_data is None else psycopg2.extras.Json(profile_data)

    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
            VALUES (%s, %s, %s, %s, 1, now(), 'email', %s)
            RETURNING id
            """,
            (username, email, "x", f"Test {role_name}", p_data),
        )
        user_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM roles WHERE name = %s", (role_name,))
        row = cur.fetchone()
        if row:
            role_id = row[0]
            cur.execute(
                "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (user_id, role_id),
            )
    return user_id


def _create_doc(
    owner_id: int,
    created_at: datetime | None = None,
    purpose: str = "student_project",
    deleted: bool = False,
) -> int:
    suffix = uuid.uuid4().hex[:16]
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents
            (filename, file_type, doc_type, storage_key, status, purpose, uploaded_by, created_at, deleted_at)
            VALUES (%s, '.pdf', 'PDF', %s, 'uploaded', %s, %s, COALESCE(%s, now()), %s)
            RETURNING id
            """,
            (
                f"doc_{suffix[:8]}.pdf",
                f"documents/{suffix}.pdf",
                purpose,
                owner_id,
                created_at,
                datetime.utcnow() if deleted else None,
            ),
        )
        return cur.fetchone()[0]


def _cleanup_user(user_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM documents WHERE uploaded_by = %s", (user_id,))
        cur.execute("DELETE FROM subscriptions WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM payment_orders WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


def _auth_token(user_id: int, role: str = "student") -> str:
    return jwt.encode(
        {"sub": str(user_id), "role": role},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _auth(user_id: int, role: str = "student") -> dict[str, str]:
    return {"Authorization": f"Bearer {_auth_token(user_id, role)}"}


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


@pytest.mark.asyncio
async def test_get_document_quota_free_user(client):
    user_id = _create_user("student")
    try:
        async with app_db.async_session_maker() as db:
            stmt = select(User).options(selectinload(User.roles)).where(User.id == user_id)
            user = (await db.execute(stmt)).scalar_one()

            # Initially 0 documents used
            quota = await get_document_quota(db, user)
            assert quota["used"] == 0
            assert quota["limit"] == 3
            assert quota["remaining"] == 3

            # Create 1 doc this month
            _create_doc(user_id)
            quota = await get_document_quota(db, user)
            assert quota["used"] == 1
            assert quota["limit"] == 3
            assert quota["remaining"] == 2

            # Create 2 more docs (total 3)
            _create_doc(user_id)
            _create_doc(user_id)
            quota = await get_document_quota(db, user)
            assert quota["used"] == 3
            assert quota["limit"] == 3
            assert quota["remaining"] == 0

            # Exceeding limit: remaining stays 0
            _create_doc(user_id)
            quota = await get_document_quota(db, user)
            assert quota["used"] == 4
            assert quota["limit"] == 3
            assert quota["remaining"] == 0
    finally:
        _cleanup_user(user_id)


@pytest.mark.asyncio
async def test_get_document_quota_filtering(client):
    """Verify deleted docs, old month docs, and staff_reference docs are not counted."""
    user_id = _create_user("student")
    try:
        # 1 soft-deleted doc
        _create_doc(user_id, deleted=True)
        # 1 old month doc
        old_date = datetime(2025, 1, 15)
        _create_doc(user_id, created_at=old_date)
        # 1 staff_reference doc
        _create_doc(user_id, purpose="staff_reference")

        async with app_db.async_session_maker() as db:
            stmt = select(User).options(selectinload(User.roles)).where(User.id == user_id)
            user = (await db.execute(stmt)).scalar_one()

            quota = await get_document_quota(db, user)
            assert quota["used"] == 0
            assert quota["remaining"] == 3

            # Add 1 valid doc
            _create_doc(user_id, purpose="student_project")
            quota = await get_document_quota(db, user)
            assert quota["used"] == 1
            assert quota["remaining"] == 2
    finally:
        _cleanup_user(user_id)


@pytest.mark.asyncio
async def test_get_document_quota_staff_and_premium(client):
    admin_id = _create_user("admin")
    premium_user_id = _create_user("student")
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO payment_orders (user_id, plan_id, order_code, amount, cycle, method, status, created_at)
            VALUES (%s, 2, %s, 99000, 'monthly', 'vietqr', 'paid', now())
            RETURNING id
            """,
            (premium_user_id, f"ORD_{uuid.uuid4().hex[:12]}"),
        )
        order_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO subscriptions (user_id, plan_id, payment_order_id, status, starts_at, expires_at, created_at)
            VALUES (%s, 2, %s, 'active', now(), now() + interval '30 days', now())
            """,
            (premium_user_id, order_id),
        )

    try:
        async with app_db.async_session_maker() as db:
            admin_user = (await db.execute(select(User).options(selectinload(User.roles)).where(User.id == admin_id))).scalar_one()
            admin_quota = await get_document_quota(db, admin_user)
            assert admin_quota["limit"] is None
            assert admin_quota["remaining"] is None

            premium_user = (await db.execute(select(User).options(selectinload(User.roles)).where(User.id == premium_user_id))).scalar_one()
            premium_quota = await get_document_quota(db, premium_user)
            assert premium_quota["limit"] is None
            assert premium_quota["remaining"] is None
    finally:
        _cleanup_user(admin_id)
        _cleanup_user(premium_user_id)


@pytest.mark.asyncio
async def test_check_document_upload_quota_enforcement(client):
    user_id = _create_user("student")
    try:
        async with app_db.async_session_maker() as db:
            stmt = select(User).options(selectinload(User.roles)).where(User.id == user_id)
            user = (await db.execute(stmt)).scalar_one()

            # Under quota: should not raise
            await check_document_upload_quota(db, user)

            # Fill up quota to 3
            _create_doc(user_id)
            _create_doc(user_id)
            _create_doc(user_id)

            with pytest.raises(HTTPException) as exc_info:
                await check_document_upload_quota(db, user)
            assert exc_info.value.status_code == 403
            assert "Bạn đã đạt giới hạn 3 tài liệu trong tháng này của gói Miễn phí" in exc_info.value.detail
    finally:
        _cleanup_user(user_id)


@pytest.mark.asyncio
async def test_payment_account_includes_document_quota(client):
    user_id = _create_user("student")
    try:
        resp = await client.get("/api/payment/account", headers=_auth(user_id))
        assert resp.status_code == 200
        data = resp.json()
        assert "access" in data
        assert "document_quota" in data["access"]
        doc_quota = data["access"]["document_quota"]
        assert doc_quota["used"] == 0
        assert doc_quota["limit"] == 3
        assert doc_quota["remaining"] == 3
    finally:
        _cleanup_user(user_id)


@pytest.mark.asyncio
async def test_upload_endpoints_block_when_quota_exhausted(client):
    user_id = _create_user("student")
    try:
        # Create 3 docs to reach the limit
        _create_doc(user_id)
        _create_doc(user_id)
        _create_doc(user_id)

        # 1. Simple upload
        files = {"file": ("test.pdf", b"%PDF-1.4 mock content", "application/pdf")}
        resp = await client.post("/api/documents/upload", files=files, headers=_auth(user_id))
        assert resp.status_code == 403
        assert "Bạn đã đạt giới hạn 3 tài liệu trong tháng này của gói Miễn phí" in resp.json()["detail"]

        # 2. Multipart init
        resp_init = await client.post(
            "/api/documents/multipart/init",
            json={"filename": "large.zip", "size": 1024 * 1024 * 10},
            headers=_auth(user_id),
        )
        assert resp_init.status_code == 403
        assert "Bạn đã đạt giới hạn 3 tài liệu trong tháng này của gói Miễn phí" in resp_init.json()["detail"]
    finally:
        _cleanup_user(user_id)
