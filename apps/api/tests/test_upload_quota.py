"""Test hạn mức upload theo gói (Free = 3 đồ án/tháng).

Chạy:
    cd apps/api && pytest tests/test_upload_quota.py -v

Lưu ý:
- Test dùng DB thật (DATABASE_URL trong .env), pattern giống test_documents_softdelete.py.
- POST /upload khi bị chặn quota sẽ raise 402 TRƯỚC khi save_doc lên MinIO,
  nên test 402 không cần MinIO. Các test "không bị chặn" chỉ assert != 402
  (kết quả cuối phụ thuộc MinIO có chạy hay không).
- Mỗi test tạo user/document/plan/subscription với UUID ngẫu nhiên, cleanup ở finally.
"""
import os
import sys
import uuid

import psycopg2
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt

# Force UTF-8 cho Windows console + đảm bảo import path
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core import database as app_db  # noqa: E402


# ---------------------------------------------------------------------------
# Sync DB helper (psycopg2)
# ---------------------------------------------------------------------------

def _conn():
    """Mở connection mới mỗi lần — kết thúc block là đóng."""
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _create_user_with_role(role_name: str = "student") -> int:
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
        role_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user_id, role_id),
        )
    return user_id


def _create_document(owner_id: int) -> int:
    suffix = uuid.uuid4().hex[:16]
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents
            (filename, file_type, doc_type, storage_key, status, purpose, uploaded_by, created_at)
            VALUES (%s, '.pdf', 'PDF', %s, 'uploaded', 'student_project', %s, now())
            RETURNING id
            """,
            (f"test_{uuid.uuid4().hex[:8]}.pdf", f"documents/{suffix}_test.pdf", owner_id),
        )
        return cur.fetchone()[0]


def _soft_delete(doc_id: int, by_user: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET deleted_at = now(), deleted_by = %s WHERE id = %s",
            (by_user, doc_id),
        )


def _create_plan(*, max_documents_per_month) -> int:
    """Tạo plan test với slug duy nhất. Trả về plan_id."""
    slug = uuid.uuid4().hex[:6]
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO subscription_plans
            (slug, name, tagline, icon, monthly, yearly, featured, special, cta, features, active, sort_order, max_documents_per_month, created_at, updated_at)
            VALUES (%s, 'Test Plan', '', 'sparkles', 0, 0, FALSE, FALSE, '', '[]', TRUE, 99, %s, now(), now())
            RETURNING id
            """,
            (slug, max_documents_per_month),
        )
        return cur.fetchone()[0]


def _create_payment_order(user_id: int, plan_id: int) -> int:
    """Tạo payment_order (subscriptions.payment_order_id là NOT NULL)."""
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO payment_orders (order_code, user_id, plan_id, cycle, amount, method, status, created_at)
            VALUES (%s, %s, %s, 'monthly', 0, 'bank', 'paid', now())
            RETURNING id
            """,
            (f"TEST{uuid.uuid4().hex[:10]}", user_id, plan_id),
        )
        return cur.fetchone()[0]


def _subscribe(user_id: int, plan_id: int, order_id: int) -> None:
    """Tạo subscription active cho user."""
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO subscriptions (user_id, plan_id, payment_order_id, starts_at, expires_at, status, created_at)
            VALUES (%s, %s, %s, now(), now() + interval '30 days', 'active', now())
            """,
            (user_id, plan_id, order_id),
        )


def _cleanup_doc(doc_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM assessments WHERE document_id = %s", (doc_id,))
        cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))


def _cleanup_user(user_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "DELETE FROM subscriptions WHERE user_id = %s", (user_id,)
        )
        cur.execute("DELETE FROM payment_orders WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


def _cleanup_plan(plan_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM subscriptions WHERE plan_id = %s", (plan_id,))
        cur.execute("DELETE FROM subscription_plans WHERE id = %s", (plan_id,))


def _auth_token(user_id: int) -> str:
    """Tạo JWT giống BE: HS256, sub=user_id, role='student'."""
    return jwt.encode(
        {"sub": str(user_id), "role": "student"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _auth(user_id: int) -> dict[str, str]:
    return {"Authorization": f"Bearer {_auth_token(user_id)}"}


def _upload_files():
    """Fake PDF file hợp lệ magic bytes (đủ để qua _validate_magic_bytes nếu tới)."""
    return {"file": ("test.pdf", b"%PDF-1.4 fake content", "application/pdf")}


async def _upload_not_quota_blocked(client, user_id: int) -> bool:
    """POST /upload; True nếu KHÔNG bị chặn quota 402.

    Khi MinIO local không chạy, save_doc raise lỗi connection SAU khi quota
    check đã pass (exception propagate qua ASGITransport) — vẫn tính là
    "không bị chặn quota".
    """
    try:
        r = await client.post(
            "/api/documents/upload", headers=_auth(user_id), files=_upload_files()
        )
        return r.status_code != 402
    except Exception:
        # Lỗi storage xảy ra sau quota check → không phải block quota
        return True


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
async def test_quota_endpoint_counts_and_remaining(client):
    """GET /quota: user free (không subscription) → limit 3, used/remaining đúng."""
    student = _create_user_with_role()
    doc1 = _create_document(student)
    doc2 = _create_document(student)
    try:
        r = await client.get("/api/documents/quota", headers=_auth(student))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["limit"] == 3
        assert data["used"] == 2
        assert data["remaining"] == 1
        assert data["plan"] == "free"
    finally:
        _cleanup_doc(doc1)
        _cleanup_doc(doc2)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_upload_blocked_at_free_limit(client):
    """3 docs trong tháng → POST /upload → 402 (chặn trước khi lưu file)."""
    student = _create_user_with_role()
    docs = [_create_document(student) for _ in range(3)]
    try:
        r = await client.post(
            "/api/documents/upload", headers=_auth(student), files=_upload_files()
        )
        assert r.status_code == 402, r.text
        assert "hết lượt upload" in r.json()["detail"]

        # Quota endpoint xác nhận remaining = 0
        r = await client.get("/api/documents/quota", headers=_auth(student))
        assert r.json()["remaining"] == 0
    finally:
        for d in docs:
            _cleanup_doc(d)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_deleted_documents_not_counted(client):
    """Xoá 1 doc → không còn tính vào hạn mức, upload không bị 402 nữa."""
    student = _create_user_with_role()
    docs = [_create_document(student) for _ in range(3)]
    _soft_delete(docs[0], student)
    try:
        r = await client.get("/api/documents/quota", headers=_auth(student))
        assert r.json()["used"] == 2
        assert r.json()["remaining"] == 1

        # Không còn bị chặn quota (lỗi MinIO local nếu có xảy ra sau quota check)
        assert await _upload_not_quota_blocked(client, student)
    finally:
        for d in docs:
            _cleanup_doc(d)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_plan_limit_from_db_enforced(client):
    """Plan DB với limit 1 → 1 doc là đủ bị chặn 402."""
    student = _create_user_with_role()
    plan_id = _create_plan(max_documents_per_month=1)
    order_id = _create_payment_order(student, plan_id)
    _subscribe(student, plan_id, order_id)
    doc = _create_document(student)
    try:
        r = await client.get("/api/documents/quota", headers=_auth(student))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["limit"] == 1
        assert data["used"] == 1
        assert data["remaining"] == 0

        r = await client.post(
            "/api/documents/upload", headers=_auth(student), files=_upload_files()
        )
        assert r.status_code == 402, r.text
    finally:
        _cleanup_doc(doc)
        _cleanup_user(student)
        _cleanup_plan(plan_id)


@pytest.mark.asyncio
async def test_unlimited_plan_not_blocked(client):
    """Plan DB với limit NULL (= không giới hạn) → 3+ docs vẫn không bị 402."""
    student = _create_user_with_role()
    plan_id = _create_plan(max_documents_per_month=None)
    order_id = _create_payment_order(student, plan_id)
    _subscribe(student, plan_id, order_id)
    docs = [_create_document(student) for _ in range(3)]
    try:
        r = await client.get("/api/documents/quota", headers=_auth(student))
        data = r.json()
        assert data["limit"] is None
        assert data["remaining"] is None

        # Không bị chặn quota dù đã 3 docs (lỗi MinIO local nếu có xảy ra sau quota check)
        assert await _upload_not_quota_blocked(client, student)
    finally:
        for d in docs:
            _cleanup_doc(d)
        _cleanup_user(student)
        _cleanup_plan(plan_id)
