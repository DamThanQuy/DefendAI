"""Test permanent-delete cho documents router (#133).

Chạy:
    cd apps/api
    $env:DATABASE_URL = "postgresql+asyncpg://postgres:postgres@localhost:5433/defense_db"
    .\venv\Scripts\python.exe -m pytest tests/test_document_permanent_delete.py -v

Lưu ý:
- Test dùng DB thật. Mỗi test tạo user/document/workspace với dữ liệu ngẫu nhiên
  rồi cleanup ở finally.
- DB setup dùng psycopg2 sync để tránh asyncpg connection pool conflict
  khi pytest-asyncio chia sẻ event loop giữa các test.
- HTTP gọi qua httpx.AsyncClient + ASGITransport (không qua TestClient
  lifespan startup hook).
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


def _conn():
    """Mở connection mới mỗi lần — kết thúc block là đóng."""
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


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
            (f"test_{uuid.uuid4().hex[:8]}.pdf", f"documents/{suffix}_perm.pdf", owner_id),
        )
        return cur.fetchone()[0]


def _create_workspace(user_id: int) -> int:
    suffix = uuid.uuid4().hex[:8]
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO workspaces (name, user_id, created_at) VALUES (%s, %s, now()) RETURNING id",
            (f"perm-test-{suffix}", user_id),
        )
        return cur.fetchone()[0]


def _add_dependents(doc_id: int, workspace_id: int) -> None:
    """Tạo các bản ghi có FK trỏ tới documents.id: assessment + UC + workspace_file."""
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO assessments (document_id, persona, status, chunks, questions, created_at) "
            "VALUES (%s, 'student', 'completed', '[]'::jsonb, '[]'::jsonb, now())",
            (doc_id,),
        )
        cur.execute(
            """
            INSERT INTO use_case_commitments
                (workspace_id, uc_code, name, status, source, source_document_id, created_at, updated_at)
            VALUES (%s, %s, %s, 'committed', 'manual', %s, now(), now())
            """,
            (
                workspace_id,
                f"UC{uuid.uuid4().hex[:6]}",
                "Test UC for permanent delete",
                doc_id,
            ),
        )
        cur.execute(
            "INSERT INTO workspace_files (workspace_id, document_id, role, added_at) "
            "VALUES (%s, %s, 'main', now())",
            (workspace_id, doc_id),
        )


def _soft_delete(doc_id: int, by_user: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET deleted_at = now(), deleted_by = %s WHERE id = %s",
            (by_user, doc_id),
        )


def _count(table: str, column: str, value: int) -> int:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {column} = %s", (value,))
        return cur.fetchone()[0]


def _cleanup_doc(doc_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM workspace_files WHERE document_id = %s", (doc_id,))
        cur.execute("DELETE FROM use_case_commitments WHERE source_document_id = %s", (doc_id,))
        cur.execute("DELETE FROM assessments WHERE document_id = %s", (doc_id,))
        cur.execute("DELETE FROM code_module_hashes WHERE document_id = %s", (doc_id,))
        cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))


def _cleanup_workspace(ws_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM workspaces WHERE id = %s", (ws_id,))


def _cleanup_user(user_id: int) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


def _auth_token(user_id: int) -> str:
    return jwt.encode(
        {"sub": str(user_id), "role": "student"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


def _auth(user_id: int) -> dict[str, str]:
    return {"Authorization": f"Bearer {_auth_token(user_id)}"}


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


@pytest.mark.asyncio
async def test_permanent_delete_soft_deleted_document(client):
    """Luồng chuẩn: tạo doc → soft delete → permanent delete → 204, row biến mất."""
    student = _create_user_with_role("student")
    doc = _create_document(student)
    try:
        r = await client.delete(f"/api/documents/{doc}", headers=_auth(student))
        assert r.status_code == 204, r.text

        r = await client.delete(
            f"/api/documents/{doc}/permanent-delete", headers=_auth(student)
        )
        assert r.status_code == 204, r.text

        r = await client.get("/api/documents/trash", headers=_auth(student))
        assert r.status_code == 200
        assert doc not in [d["id"] for d in r.json()["items"]]

        assert _count("documents", "id", doc) == 0
    finally:
        _cleanup_doc(doc)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_permanent_delete_cleans_all_document_dependents(client):
    """Trước #133 hành này văng 500 do import sai module UseCaseCommitment và
    dùng `UseCaseCommitment.document_id` / `AnalysisJob.document_id` không tồn tại.
    Test này đảm bảo cả 3 loại con (assessment, UC qua source_document_id,
    workspace_file) được dọn sạch."""
    student = _create_user_with_role("student")
    doc = _create_document(student)
    ws = _create_workspace(student)
    try:
        _add_dependents(doc, ws)
        _soft_delete(doc, student)

        assert _count("use_case_commitments", "source_document_id", doc) == 1
        assert _count("workspace_files", "document_id", doc) == 1
        assert _count("assessments", "document_id", doc) == 1

        r = await client.delete(
            f"/api/documents/{doc}/permanent-delete", headers=_auth(student)
        )
        assert r.status_code == 204, r.text

        assert _count("documents", "id", doc) == 0
        assert _count("use_case_commitments", "source_document_id", doc) == 0
        assert _count("workspace_files", "document_id", doc) == 0
        assert _count("assessments", "document_id", doc) == 0
    finally:
        _cleanup_doc(doc)
        _cleanup_workspace(ws)
        _cleanup_user(student)


@pytest.mark.asyncio
async def test_permanent_delete_rejects_active_document(client):
    """Doc chưa bị xoá mềm thì không purge được."""
    student = _create_user_with_role("student")
    doc = _create_document(student)
    try:
        r = await client.delete(
            f"/api/documents/{doc}/permanent-delete", headers=_auth(student)
        )
        assert r.status_code == 400, r.text
        assert "chưa bị xoá" in r.json()["detail"]
        assert _count("documents", "id", doc) == 1
    finally:
        _cleanup_doc(doc)
        _cleanup_user(student)
