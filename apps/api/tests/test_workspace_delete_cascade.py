"""Test xoá workspace (#122).

Nguyên nhân cũ: use_case_commitments có FK workspaces.id NHƯNG Workspace không
cascade relationship đó → DELETE workspace bị ForeignKeyViolation → HTTP 500.

Chạy:
    cd apps/api && pytest tests/test_workspace_delete_cascade.py -v

Test dùng DB thật (DATABASE_URL trong .env) giống test_documents_softdelete.py,
mỗi test tạo user riêng rồi cleanup ở finally.
"""
import os
import sys
import uuid

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


def _create_student() -> int:
    suffix = uuid.uuid4().hex[:12]
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
            VALUES (%s, %s, %s, %s, 1, now(), 'email', '{}')
            RETURNING id
            """,
            (f"pytest-{suffix}", f"test-{suffix}@pytest.local", "x", "WS Delete Test"),
        )
        user_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM roles WHERE name = 'student'")
        role_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user_id, role_id),
        )
    return user_id


def _add_commitment(workspace_id: int) -> int:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO use_case_commitments (workspace_id, uc_code, name, status, source, created_at, updated_at)
            VALUES (%s, 'UC01', 'commitment', 'committed', 'manual', now(), now())
            RETURNING id
            """,
            (workspace_id,),
        )
        return cur.fetchone()[0]


def _cleanup(user_id: int, workspace_ids: list[int]) -> None:
    with _conn() as conn, conn.cursor() as cur:
        for wid in workspace_ids:
            cur.execute("DELETE FROM use_case_commitments WHERE workspace_id = %s", (wid,))
            cur.execute("DELETE FROM workspaces WHERE id = %s", (wid,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))


def _auth(user_id: int) -> dict[str, str]:
    token = jwt.encode(
        {"sub": str(user_id), "role": "student"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


@pytest.mark.asyncio
async def test_delete_workspace_with_use_case_commitment(client):
    """Workspace có cam kết UC phải xoá được (cascade), không được 500."""
    user_id = _create_student()
    workspace_ids: list[int] = []
    try:
        created = await client.post(
            "/api/workspaces/",
            headers=_auth(user_id),
            json={"name": f"[test] ws delete {uuid.uuid4().hex[:6]}"},
        )
        assert created.status_code == 201, created.text
        ws_id = created.json()["id"]
        workspace_ids.append(ws_id)

        commitment_id = _add_commitment(ws_id)

        deleted = await client.delete(f"/api/workspaces/{ws_id}", headers=_auth(user_id))
        assert deleted.status_code == 204, deleted.text

        with _conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM workspaces WHERE id = %s", (ws_id,))
            assert cur.fetchone()[0] == 0
            cur.execute("SELECT count(*) FROM use_case_commitments WHERE id = %s", (commitment_id,))
            assert cur.fetchone()[0] == 0

        workspace_ids.remove(ws_id)
    finally:
        _cleanup(user_id, workspace_ids)


@pytest.mark.asyncio
async def test_delete_workspace_without_children(client):
    """Workspace trống vẫn xoá được như cũ (không regress)."""
    user_id = _create_student()
    workspace_ids: list[int] = []
    try:
        created = await client.post(
            "/api/workspaces/",
            headers=_auth(user_id),
            json={"name": f"[test] ws plain {uuid.uuid4().hex[:6]}"},
        )
        assert created.status_code == 201, created.text
        ws_id = created.json()["id"]
        workspace_ids.append(ws_id)

        deleted = await client.delete(f"/api/workspaces/{ws_id}", headers=_auth(user_id))
        assert deleted.status_code == 204, deleted.text
        workspace_ids.remove(ws_id)
    finally:
        _cleanup(user_id, workspace_ids)
