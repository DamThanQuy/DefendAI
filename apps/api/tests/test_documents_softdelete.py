"""Test soft-delete cho documents router.

Chạy:
    cd apps/api && pytest tests/test_documents_softdelete.py -v

Lưu ý:
- Test dùng DB thật (DATABASE_URL trong .env). Mỗi test tạo user + document
  với UUID ngẫu nhiên để không đụng hàng dữ liệu khác, rồi cleanup ở finally.
- DB setup dùng psycopg2 sync để tránh asyncpg connection pool conflict
  khi pytest-asyncio chia sẻ event loop giữa các test.
- HTTP gọi qua httpx.AsyncClient + ASGITransport (không qua TestClient
  lifespan startup hook).
"""
import os
import sys
import uuid
from datetime import datetime

import psycopg2
import psycopg2.extras
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
# Sync DB helper (psycopg2) — tránh asyncpg connection pool conflict giữa các test
# ---------------------------------------------------------------------------

def _conn():
    """Mở connection mới mỗi lần — kết thúc block là đóng."""
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _create_user_with_role(role_name: str) -> int:
    """Tạo user + gán role. Trả về user_id."""
    suffix = uuid.uuid4().hex[:12]
    email = f"test-{suffix}@pytest.local"
    username = f"pytest-{suffix}"

    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider)
            VALUES (%s, %s, %s, %s, 1, now(), 'email')
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


def _create_document(owner_id: int, *, with_completed_assessment: bool = False) -> int:
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
        doc_id = cur.fetchone()[0]
        if with_completed_assessment:
            cur.execute(
                "INSERT INTO assessments (document_id, persona, status, chunks, questions, created_at) "
                "VALUES (%s, 'student', 'completed', '[]'::jsonb, '[]'::jsonb, now())",
                (doc_id,),
            )
    return doc_id


def _soft_delete(doc_id: int, by_user: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET deleted_at = now(), deleted_by = %s WHERE id = %s",
            (by_user, doc_id),
        )


def _cleanup_doc(doc_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM assessments WHERE document_id = %s", (doc_id,))
        cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))


def _cleanup_user(user_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


def _auth_token(user_id: int) -> str:
    """Tạo JWT giống BE: HS256, sub=user_id, role='student'."""
    return jwt.encode(
        {"sub": str(user_id), "role": "student"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _auth(user_id: int) -> dict[str, str]:
    return {"Authorization": f"Bearer {_auth_token(user_id)}"}


# ---------------------------------------------------------------------------
# Fixture: AsyncClient (không qua TestClient lifespan startup)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    # Reset asyncpg connection pool mỗi test — pytest-asyncio tạo event loop
    # mới nhưng engine cache connection cũ → "another operation is in progress".
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_student_can_soft_delete_own_document_without_assessment(client):
    student = _create_user_with_role("student")
    doc = _create_document(student)
    try:
        r = await client.delete(f"/api/documents/{doc}", headers=_auth(student))
        assert r.status_code == 204, r.text

        r = await client.get("/api/documents/", headers=_auth(student))
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()["items"]]
        assert doc not in ids

        r = await client.get("/api/documents/trash", headers=_auth(student))
        assert r.status_code == 200
        assert doc in [d["id"] for d in r.json()["items"]]

        r = await client.get(f"/api/documents/{doc}", headers=_auth(student))
        assert r.status_code == 410
    finally:
        _cleanup_doc(doc)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_student_cannot_delete_document_with_completed_assessment(client):
    student = _create_user_with_role("student")
    doc = _create_document(student, with_completed_assessment=True)
    try:
        r = await client.delete(f"/api/documents/{doc}", headers=_auth(student))
        assert r.status_code == 409, r.text
        assert "đánh giá hoàn thành" in r.json()["detail"]
    finally:
        _cleanup_doc(doc)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_mentor_can_delete_any_student_document(client):
    student = _create_user_with_role("student")
    mentor = _create_user_with_role("mentor")
    doc = _create_document(student)
    try:
        r = await client.delete(f"/api/documents/{doc}", headers=_auth(mentor))
        assert r.status_code == 204, r.text

        r = await client.get("/api/documents/trash", headers=_auth(mentor))
        assert r.status_code == 200
        assert doc in [d["id"] for d in r.json()["items"]]
    finally:
        _cleanup_doc(doc)
        _cleanup_user(student)
        _cleanup_user(mentor)


@pytest.mark.asyncio
async def test_admin_purge_hard_deletes_document(client):
    admin = _create_user_with_role("admin")
    student = _create_user_with_role("student")
    doc = _create_document(student)

    # soft-delete trước
    _soft_delete(doc, admin)

    try:
        r = await client.delete(
            f"/api/admin/documents/{doc}/purge",
            headers=_auth(admin),
        )
        assert r.status_code == 204, r.text

        r = await client.get("/api/documents/trash", headers=_auth(admin))
        assert r.status_code == 200
        assert doc not in [d["id"] for d in r.json()["items"]]

        # Verify DB row deleted
        with _conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM documents WHERE id = %s", (doc,))
            assert cur.fetchone() is None
    finally:
        _cleanup_user(admin)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_restore_brings_document_back(client):
    student = _create_user_with_role("student")
    doc = _create_document(student)
    try:
        r = await client.delete(f"/api/documents/{doc}", headers=_auth(student))
        assert r.status_code == 204

        r = await client.post(f"/api/documents/{doc}/restore", headers=_auth(student))
        assert r.status_code == 200, r.text
        restored = r.json()
        assert restored["id"] == doc
        assert restored["deleted_at"] is None
        assert restored["deleted_by"] is None

        r = await client.get(f"/api/documents/{doc}", headers=_auth(student))
        assert r.status_code == 200
    finally:
        _cleanup_doc(doc)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_trash_endpoint_returns_only_own_for_student(client):
    student_a = _create_user_with_role("student")
    student_b = _create_user_with_role("student")
    doc_a = _create_document(student_a)
    doc_b = _create_document(student_b)

    _soft_delete(doc_a, student_a)
    _soft_delete(doc_b, student_b)

    try:
        r = await client.get("/api/documents/trash", headers=_auth(student_a))
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()["items"]]
        assert doc_a in ids
        assert doc_b not in ids
    finally:
        _cleanup_doc(doc_a)
        _cleanup_doc(doc_b)
        _cleanup_user(student_a)
        _cleanup_user(student_b)