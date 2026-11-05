"""Test API báo cáo sinh viên: /api/reports, /api/mock-ai/end-session, phân quyền scoring/rules.

Cần Postgres đã migrate + rubric defense_sep490 đã seed (docker). Job AI được
thay bằng stub — không đẩy vào Redis, không gọi AI.

Chạy:
    docker exec defense-api pytest tests/test_student_report_api.py -v
"""
import json
import os
import sys
import uuid
from datetime import datetime, timedelta
from unittest.mock import ANY

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
from app.services import mock_report  # noqa: E402


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


@pytest.fixture
def queued_jobs(monkeypatch):
    """Ghi lại job thay vì đẩy vào Redis/worker."""
    jobs = []

    async def _fake_create_job(job_type, params):
        jobs.append((job_type, params))
        return f"job-{len(jobs)}"

    monkeypatch.setattr(mock_report, "create_job", _fake_create_job)
    return jobs


@pytest.fixture
def users():
    created: list[int] = []

    def _make(role: str) -> int:
        user_id = _create_user_with_role(role)
        created.append(user_id)
        return user_id

    yield _make
    _cleanup(created)


def _create_user_with_role(role_name: str) -> int:
    suffix = uuid.uuid4().hex[:12]
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
            VALUES (%s, %s, %s, %s, 1, now(), 'email', '{}')
            RETURNING id
            """,
            (f"pytest-{suffix}", f"test-{suffix}@pytest.local", "x", f"Test {role_name}"),
        )
        user_id = cur.fetchone()[0]
        cur.execute("SELECT id FROM roles WHERE name = %s", (role_name,))
        role_row = cur.fetchone()
        if role_row:
            role_id = role_row[0]
        else:
            cur.execute("INSERT INTO roles (name) VALUES (%s) RETURNING id", (role_name,))
            role_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (user_id, role_id),
        )
        conn.commit()
    return user_id


def _cleanup(user_ids: list[int]) -> None:
    if not user_ids:
        return
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM meetings WHERE student_id = ANY(%s)", (user_ids,))
        meeting_ids = [r[0] for r in cur.fetchall()]
        if meeting_ids:
            cur.execute(
                "DELETE FROM audit_defense_scores WHERE score_id IN "
                "(SELECT id FROM defense_scores WHERE meeting_id = ANY(%s))",
                (meeting_ids,),
            )
            cur.execute("DELETE FROM defense_scores WHERE meeting_id = ANY(%s)", (meeting_ids,))
            cur.execute("DELETE FROM committee_decisions WHERE meeting_id = ANY(%s)", (meeting_ids,))
            cur.execute(
                "DELETE FROM reports WHERE evaluation_id IN "
                "(SELECT id FROM evaluations WHERE meeting_id = ANY(%s))",
                (meeting_ids,),
            )
            cur.execute("DELETE FROM evaluations WHERE meeting_id = ANY(%s)", (meeting_ids,))
            cur.execute("DELETE FROM meetings WHERE id = ANY(%s)", (meeting_ids,))
        cur.execute("DELETE FROM audit_defense_scores WHERE actor_id = ANY(%s)", (user_ids,))
        cur.execute("DELETE FROM mock_chat_messages WHERE user_id = ANY(%s)", (user_ids,))
        cur.execute("DELETE FROM mock_chat_sessions WHERE user_id = ANY(%s)", (user_ids,))
        cur.execute("DELETE FROM user_roles WHERE user_id = ANY(%s)", (user_ids,))
        cur.execute("DELETE FROM users WHERE id = ANY(%s)", (user_ids,))
        conn.commit()


def _auth(user_id: int, role: str) -> dict:
    payload = {"sub": str(user_id), "role": role, "exp": datetime.utcnow() + timedelta(hours=1)}
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return {"Authorization": f"Bearer {token}"}


def _create_report(student_id: int, *, generation_status: str = "ready") -> tuple[int, int]:
    """Meeting + evaluation + report (đã có nhận xét AI) của sinh viên → (report_id, meeting_id)."""
    now = datetime.utcnow()
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO meetings (name, status, student_id, created_at) "
            "VALUES (%s, 'ended', %s, %s) RETURNING id",
            ("Mock AI — pytest", student_id, now),
        )
        meeting_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO evaluations (meeting_id, reviewer_name, scores, created_at) "
            "VALUES (%s, 'Giám khảo AI', '{}', %s) RETURNING id",
            (meeting_id, now),
        )
        evaluation_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO reports (evaluation_id, ai_feedback, quality_criteria, strengths, weaknesses,
                                 action_items, transcript, source, generation_status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'ai_mock', %s, %s, %s)
            RETURNING id
            """,
            (
                evaluation_id,
                "Nhận xét tổng quan",
                json.dumps([{"key": "br_chac", "level": "Khá", "comment": "", "evidence": ""}]),
                json.dumps(["Nắm kiến trúc"]),
                json.dumps(["Thiếu test"]),
                json.dumps(["Bổ sung test case"]),
                json.dumps([{"role": "student", "content": "Em xin trình bày", "time": ""}]),
                generation_status,
                now,
                now,
            ),
        )
        report_id = cur.fetchone()[0]
        conn.commit()
    return report_id, meeting_id


def _create_mock_session(user_id: int, messages: list[tuple[str, str]]) -> int:
    now = datetime.utcnow()
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO mock_chat_sessions (user_id, document_id, title, message_count, created_at, updated_at) "
            "VALUES (%s, NULL, %s, %s, %s, %s) RETURNING id",
            (user_id, "Phiên pytest", len(messages), now, now),
        )
        session_id = cur.fetchone()[0]
        for role, content in messages:
            cur.execute(
                "INSERT INTO mock_chat_messages (user_id, session_id, role, content, time_label, document_id, created_at) "
                "VALUES (%s, %s, %s, %s, '', NULL, %s)",
                (user_id, session_id, role, content, now),
            )
        conn.commit()
    return session_id


@pytest.mark.asyncio
async def test_my_reports_only_returns_own(client: AsyncClient, users):
    owner, other = users("student"), users("student")
    report_id, _ = _create_report(owner)

    resp = await client.get("/api/reports/my-reports", headers=_auth(owner, "student"))
    assert resp.status_code == 200
    data = resp.json()
    item = next(r for r in data["reports"] if r["id"] == report_id)
    assert item["status"] == "in_review"  # có nhận xét AI, chưa có điểm mentor
    assert item["quality_criteria"][0]["level"] == "Khá"
    assert data["summary"]["total"] == 1
    assert data["summary"]["average_score"] is None

    resp_other = await client.get("/api/reports/my-reports", headers=_auth(other, "student"))
    assert resp_other.status_code == 200
    assert all(r["id"] != report_id for r in resp_other.json()["reports"])


@pytest.mark.asyncio
async def test_report_detail_forbidden_for_other_student(client: AsyncClient, users):
    owner, other = users("student"), users("student")
    report_id, _ = _create_report(owner)

    resp = await client.get(f"/api/reports/{report_id}", headers=_auth(other, "student"))
    assert resp.status_code == 403

    own = await client.get(f"/api/reports/{report_id}", headers=_auth(owner, "student"))
    assert own.status_code == 200
    body = own.json()
    assert body["ai_review"]["strengths"] == ["Nắm kiến trúc"]
    assert body["scores"]["official"] is None
    assert body["verdict"]["is_official"] is False


@pytest.mark.asyncio
async def test_admin_scores_make_report_completed(client: AsyncClient, users):
    owner, admin = users("student"), users("admin")
    report_id, meeting_id = _create_report(owner)

    assert (await client.get(f"/api/reports/{report_id}", headers=_auth(admin, "admin"))).status_code == 200
    put = await client.put(
        f"/api/scoring/meetings/{meeting_id}/scores",
        headers=_auth(admin, "admin"),
        json={"scores": [{"group": "TDA", "item_code": "srs", "mark": 8}]},
    )
    assert put.status_code == 200

    detail = (await client.get(f"/api/reports/{report_id}", headers=_auth(admin, "admin"))).json()
    assert detail["status"] == "completed"
    assert detail["rubric_locked"] is False
    srs = next(i for i in detail["scores"]["items"]["TDA"] if i["code"] == "srs")
    assert srs["mark"] == 8.0


@pytest.mark.asyncio
async def test_free_student_sees_the_result_but_not_rubric_details(client: AsyncClient, users):
    owner, admin = users("student"), users("admin")
    report_id, meeting_id = _create_report(owner)
    await client.put(
        f"/api/scoring/meetings/{meeting_id}/scores",
        headers=_auth(admin, "admin"),
        json={"scores": [{"group": "TDA", "item_code": "srs", "mark": 8, "comment": "Ổn"}]},
    )

    detail = (await client.get(f"/api/reports/{report_id}", headers=_auth(owner, "student"))).json()

    assert detail["rubric_locked"] is True
    assert detail["status"] == "completed"
    assert detail["scores"]["official"]["oga"] is None
    assert detail["scores"]["official"]["tda"] is None
    srs = next(i for i in detail["scores"]["items"]["TDA"] if i["code"] == "srs")
    assert (srs["mark"], srs["ai_mark"], srs["reviews"]) == (None, None, [])
    summary = await client.get(f"/api/scoring/meetings/{meeting_id}/summary", headers=_auth(owner, "student"))
    assert summary.status_code == 403


@pytest.mark.asyncio
async def test_premium_student_sees_rubric_details(client: AsyncClient, users):
    owner, admin = users("student"), users("admin")
    report_id, meeting_id = _create_report(owner)
    await client.put(
        f"/api/scoring/meetings/{meeting_id}/scores",
        headers=_auth(admin, "admin"),
        json={"scores": [{"group": "TDA", "item_code": "srs", "mark": 8}]},
    )
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE users SET profile_data = %s WHERE id = %s",
            (json.dumps({"membership": {"plan": "premium", "status": "active", "expires_at": "2099-01-01T00:00:00"}}), owner),
        )
        conn.commit()

    detail = (await client.get(f"/api/reports/{report_id}", headers=_auth(owner, "student"))).json()

    assert detail["rubric_locked"] is False
    srs = next(i for i in detail["scores"]["items"]["TDA"] if i["code"] == "srs")
    assert srs["mark"] == 8.0


@pytest.mark.asyncio
async def test_student_cannot_score_or_read_other_scores(client: AsyncClient, users):
    owner, other = users("student"), users("student")
    _, meeting_id = _create_report(owner)

    put = await client.put(
        f"/api/scoring/meetings/{meeting_id}/scores",
        headers=_auth(owner, "student"),
        json={"scores": [{"group": "TDA", "item_code": "srs", "mark": 10}]},
    )
    assert put.status_code == 403
    summary = await client.get(f"/api/scoring/meetings/{meeting_id}/summary", headers=_auth(other, "student"))
    assert summary.status_code == 403
    rules = await client.get(f"/api/rules/meetings/{meeting_id}/check", headers=_auth(other, "student"))
    assert rules.status_code == 403
    assert (await client.get(f"/api/scoring/meetings/{meeting_id}/summary")).status_code == 401


@pytest.mark.asyncio
async def test_end_session_creates_single_report(client: AsyncClient, users, queued_jobs):
    student = users("student")
    session_id = _create_mock_session(
        student,
        [("mentor", "Em hãy trình bày tổng quan đề tài?"), ("user", "Đề tài giải quyết việc đặt lịch phòng lab")],
    )

    first = await client.post(
        "/api/mock-ai/end-session", headers=_auth(student, "student"), json={"session_id": session_id}
    )
    assert first.status_code == 202
    body = first.json()
    assert body["generation_status"] == "pending"
    assert queued_jobs == [("mock_report", {"report_id": body["report_id"], "requested_at": ANY})]

    # Bấm lại khi đang tổng hợp → cùng báo cáo, không tạo job trùng
    again = await client.post(
        "/api/mock-ai/end-session", headers=_auth(student, "student"), json={"session_id": session_id}
    )
    assert again.status_code == 202
    assert again.json()["report_id"] == body["report_id"]
    assert len(queued_jobs) == 1

    detail = (await client.get(f"/api/reports/{body['report_id']}", headers=_auth(student, "student"))).json()
    assert detail["status"] == "pending"
    assert detail["ai_review"] is None
    assert detail["transcript"][-1]["role"] == "student"

    listed = (await client.get("/api/reports/my-reports", headers=_auth(student, "student"))).json()
    assert any(r["id"] == body["report_id"] for r in listed["reports"])


@pytest.mark.asyncio
async def test_end_session_rejects_foreign_or_unanswered_session(client: AsyncClient, users, queued_jobs):
    owner, other = users("student"), users("student")
    session_id = _create_mock_session(owner, [("mentor", "Chào em, mời em trình bày")])

    resp = await client.post(
        "/api/mock-ai/end-session", headers=_auth(owner, "student"), json={"session_id": session_id}
    )
    assert resp.status_code == 400  # chưa có câu trả lời nào của sinh viên
    resp = await client.post(
        "/api/mock-ai/end-session", headers=_auth(other, "student"), json={"session_id": session_id}
    )
    assert resp.status_code == 404
    assert queued_jobs == []


@pytest.mark.asyncio
async def test_regenerate_only_failed_report_of_owner(client: AsyncClient, users, queued_jobs):
    owner, other = users("student"), users("student")
    ready_id, _ = _create_report(owner)
    failed_id, _ = _create_report(owner, generation_status="failed")

    assert (await client.post(f"/api/reports/{ready_id}/regenerate", headers=_auth(owner, "student"))).status_code == 409
    assert (await client.post(f"/api/reports/{failed_id}/regenerate", headers=_auth(other, "student"))).status_code == 403

    resp = await client.post(f"/api/reports/{failed_id}/regenerate", headers=_auth(owner, "student"))
    assert resp.status_code == 202
    assert resp.json()["generation_status"] == "pending"
    assert len(queued_jobs) == 1
