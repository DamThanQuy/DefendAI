"""Integration tests cho Feedback backend API của DefendAI.

Kiểm thử toàn diện 4 yêu cầu:
1. Test user context trả về đúng cấu trúc và features (GET /api/feedback/user-context)
2. Test submit feedback thành công và profile_data['mock_ai_trial_tickets'] tăng lên 1 (POST /api/feedback)
3. Test has_submitted chuyển thành True sau khi gửi
4. Test admin stats tổng hợp đúng số liệu (GET /api/feedback/stats)

Hỗ trợ chạy cả trên host local (port 5433) và bên trong Docker container defense-api (port 5432).
"""
from datetime import datetime, timedelta
import json
import os
import socket
import sys
import uuid

from httpx import ASGITransport, AsyncClient
from jose import jwt
import psycopg2
import pytest
import pytest_asyncio

# Thiết lập encoding UTF-8
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

from app.core import database as app_db  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.main import app  # noqa: E402


def _conn():
    """Tạo kết nối psycopg2 trực tiếp đến DB cho test fixtures và verification."""
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    try:
        return psycopg2.connect(url)
    except psycopg2.OperationalError:
        if "@db:5432" in url:
            url_local = url.replace("@db:5432", "@localhost:5433")
            return psycopg2.connect(url_local)
        raise


@pytest_asyncio.fixture
async def client():
    """Tạo AsyncClient dùng ASGITransport."""
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


def _create_user_with_role(role_name: str, profile_data: dict | None = None) -> int:
    """Tạo user test độc lập với role cụ thể trong DB."""
    suffix = uuid.uuid4().hex[:12]
    email = f"test-{suffix}@pytest.local"
    username = f"pytest-{suffix}"
    profile_json = json.dumps(profile_data or {})

    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
            VALUES (%s, %s, %s, %s, 1, now(), 'email', %s)
            RETURNING id
            """,
            (username, email, "hashed_pw_placeholder", f"Test {role_name.capitalize()}", profile_json),
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
    """Xóa dữ liệu test liên quan đến user để đảm bảo tính cô lập giữa các test."""
    with _conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM feedbacks WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM messages WHERE workspace_id IN (SELECT id FROM workspaces WHERE user_id = %s)", (user_id,))
        cur.execute("DELETE FROM workspace_questions WHERE workspace_id IN (SELECT id FROM workspaces WHERE user_id = %s)", (user_id,))
        cur.execute("DELETE FROM workspaces WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.commit()


def _add_workspace_interaction(user_id: int):
    """Thêm workspace + message để user có tương tác tính năng hợp lệ."""
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO workspaces (name, user_id, created_at) VALUES (%s, %s, now()) RETURNING id",
            ("Đề tài Test Đã Tương Tác", user_id),
        )
        ws_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO messages (workspace_id, role, content, status, created_at) VALUES (%s, 'user', 'Hỏi AI đề tài tốt nghiệp', 'completed', now())",
            (ws_id,),
        )
        conn.commit()


def _make_token(user_id: int, role: str) -> str:
    """Tạo JWT token giả lập đăng nhập."""
    payload = {
        "sub": str(user_id),
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


# ===========================================================================
# 1. Test User Context trả về đúng cấu trúc và features
# ===========================================================================

@pytest.mark.asyncio
async def test_feedback_user_context_unauthenticated(client: AsyncClient):
    """GET /api/feedback/user-context từ chối request không có JWT (401)."""
    resp = await client.get("/api/feedback/user-context")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_feedback_user_context_structure_and_features(client: AsyncClient):
    """GET /api/feedback/user-context trả về đúng cấu trúc dữ liệu và nhận diện features."""
    initial_tickets = 0
    student_id = _create_user_with_role(
        "student",
        {"mock_ai_trial_tickets": initial_tickets, "membership": {"status": "inactive"}},
    )
    try:
        # Thêm 1 workspace có tương tác AI thực tế (message) để hệ thống nhận diện feature 'workspaces'
        _add_workspace_interaction(student_id)

        token = _make_token(student_id, "student")
        resp = await client.get(
            "/api/feedback/user-context",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()

        # Kiểm tra đúng các trường trong cấu trúc schema FeedbackUserContextResponse
        assert "user_id" in data
        assert "email" in data
        assert "full_name" in data
        assert "current_plan" in data
        assert "has_submitted" in data
        assert "detected_features" in data
        assert "feature_counts" in data
        assert "mock_ai_trial_tickets" in data
        assert "eligible_for_feedback" in data

        # Kiểm tra chi tiết giá trị
        assert data["user_id"] == student_id
        assert data["current_plan"] == "free"
        assert data["has_submitted"] is False
        assert data["mock_ai_trial_tickets"] == initial_tickets
        assert data["eligible_for_feedback"] is True

        # Kiểm tra nhận diện tính năng (features)
        assert isinstance(data["detected_features"], list)
        assert "workspaces" in data["detected_features"]
        assert isinstance(data["feature_counts"], dict)
        assert data["feature_counts"]["workspaces"] >= 1
        assert "analysis" in data["feature_counts"]
        assert "bookings" in data["feature_counts"]
        assert "meetings" in data["feature_counts"]
        assert "reports" in data["feature_counts"]

        # Kiểm tra route alias /context
        alias_resp = await client.get(
            "/api/feedback/context",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert alias_resp.status_code == 200
        alias_data = alias_resp.json()
        assert alias_data["user_id"] == data["user_id"]
        assert alias_data["detected_features"] == data["detected_features"]
        assert alias_data["eligible_for_feedback"] is True
    finally:
        _cleanup_user(student_id)


# ===========================================================================
# 2. Test Submit feedback thành công và profile_data['mock_ai_trial_tickets'] tăng lên 1
# ===========================================================================

@pytest.mark.asyncio
async def test_submit_feedback_success_and_increments_mock_ai_trial_tickets(client: AsyncClient):
    """POST /api/feedback thành công và profile_data['mock_ai_trial_tickets'] tăng lên 1."""
    initial_tickets = 0
    student_id = _create_user_with_role(
        "student",
        {"mock_ai_trial_tickets": initial_tickets},
    )
    try:
        # Thêm tương tác workspace cho student_id để đạt điều kiện Experience Gate
        _add_workspace_interaction(student_id)

        token = _make_token(student_id, "student")
        payload = {
            "overall_rating": 5,
            "current_plan": "free",
            "aspect_ratings": {"ui": 5, "speed": 4, "accuracy": 5},
            "detected_features": ["workspaces"],
            "feature_ratings": {"workspaces": 5},
            "best_thing": "Phản hồi thông minh và trực quan",
            "suggested_change": "Thêm gợi ý slide thuyết trình",
            "will_recommend": 10,
            "pay_willingness": "99000",
        }

        resp = await client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        assert resp.status_code == 201
        data = resp.json()

        # Kiểm tra phản hồi submit thành công
        assert data["success"] is True
        assert data["feedback_id"] > 0
        assert data["mock_ai_trial_tickets"] == initial_tickets + 1

        # Xác thực trực tiếp trong cơ sở dữ liệu (users.profile_data)
        with _conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT profile_data FROM users WHERE id = %s", (student_id,))
            row = cur.fetchone()
            assert row is not None
            profile = row[0]
            assert isinstance(profile, dict)
            assert profile.get("mock_ai_trial_tickets") == initial_tickets + 1
            assert profile.get("feedback_status", {}).get("reward_ticket_granted") is True

        # Test submit qua alias /api/feedback/submit với user có sẵn 2 tickets -> lên 3
        second_initial_tickets = 2
        student2_id = _create_user_with_role(
            "student",
            {"mock_ai_trial_tickets": second_initial_tickets},
        )
        try:
            _add_workspace_interaction(student2_id)
            token2 = _make_token(student2_id, "student")
            resp2 = await client.post(
                "/api/feedback/submit",
                headers={"Authorization": f"Bearer {token2}"},
                json={"overall_rating": 4},
            )
            assert resp2.status_code == 201
            assert resp2.json()["mock_ai_trial_tickets"] == second_initial_tickets + 1

            with _conn() as conn, conn.cursor() as cur:
                cur.execute("SELECT profile_data FROM users WHERE id = %s", (student2_id,))
                profile2 = cur.fetchone()[0]
                assert profile2.get("mock_ai_trial_tickets") == second_initial_tickets + 1
        finally:
            _cleanup_user(student2_id)
    finally:
        _cleanup_user(student_id)


# ===========================================================================
# 3. Test has_submitted chuyển thành True sau khi gửi
# ===========================================================================

@pytest.mark.asyncio
async def test_feedback_has_submitted_becomes_true_after_submission(client: AsyncClient):
    """Kiểm tra cờ has_submitted chuyển từ False sang True sau khi gửi feedback."""
    student_id = _create_user_with_role("student", {"mock_ai_trial_tickets": 0})
    try:
        _add_workspace_interaction(student_id)
        token = _make_token(student_id, "student")

        # 1. Trước khi gửi: has_submitted phải là False, eligible_for_feedback là True
        resp_before = await client.get(
            "/api/feedback/user-context",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp_before.status_code == 200
        assert resp_before.json()["has_submitted"] is False
        assert resp_before.json()["eligible_for_feedback"] is True

        # 2. Gửi feedback
        payload = {
            "overall_rating": 4,
            "current_plan": "free",
            "aspect_ratings": {"ui": 4},
            "will_recommend": 9,
            "pay_willingness": "49000",
        }
        submit_resp = await client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        assert submit_resp.status_code == 201

        # 3. Sau khi gửi: profile_data['feedback_status']['submitted'] phải là True
        with _conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT profile_data FROM users WHERE id = %s", (student_id,))
            profile = cur.fetchone()[0]
            assert profile["feedback_status"]["submitted"] is True

        # 4. GET /api/feedback/user-context trả về has_submitted = True và eligible_for_feedback = False
        resp_after = await client.get(
            "/api/feedback/user-context",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp_after.status_code == 200
        assert resp_after.json()["has_submitted"] is True
        assert resp_after.json()["eligible_for_feedback"] is False
    finally:
        _cleanup_user(student_id)


# ===========================================================================
# 4. Test Admin Stats tổng hợp đúng số liệu
# ===========================================================================

@pytest.mark.asyncio
async def test_admin_stats_role_guard(client: AsyncClient):
    """GET /api/feedback và GET /api/feedback/stats chỉ cho phép admin truy cập."""
    student_id = _create_user_with_role("student")
    try:
        student_token = _make_token(student_id, "student")

        resp_list = await client.get(
            "/api/feedback",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert resp_list.status_code == 403

        resp_stats = await client.get(
            "/api/feedback/stats",
            headers={"Authorization": f"Bearer {student_token}"},
        )
        assert resp_stats.status_code == 403
    finally:
        _cleanup_user(student_id)


@pytest.mark.asyncio
async def test_admin_stats_aggregation_accuracy(client: AsyncClient):
    """Kiểm tra GET /api/feedback/stats tổng hợp chính xác CSAT, NPS, Funnel, WTP."""
    admin_id = _create_user_with_role("admin")
    student1_id = _create_user_with_role("student")
    student2_id = _create_user_with_role("student")
    try:
        admin_token = _make_token(admin_id, "admin")

        # Lấy số liệu thống kê ban đầu trước khi gửi test feedback
        initial_stats_resp = await client.get(
            "/api/feedback/stats",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert initial_stats_resp.status_code == 200
        init_stats = initial_stats_resp.json()

        base_csat_total = init_stats["csat"]["total_responses"]
        base_5_star = init_stats["csat"]["rating_distribution"].get("5", 0)
        base_2_star = init_stats["csat"]["rating_distribution"].get("2", 0)

        base_nps_total = init_stats["nps"]["total_nps_responses"]
        base_promoters = init_stats["nps"]["promoters_count"]
        base_detractors = init_stats["nps"]["detractors_count"]

        base_wtp_total = init_stats["willingness_to_pay"]["total_responses"]
        base_wtp_paid = init_stats["willingness_to_pay"]["paid_count"]
        base_wtp_free = init_stats["willingness_to_pay"]["free_count"]

        # Thêm tương tác thực tế cho student1 và student2 để đạt điều kiện gửi khảo sát
        _add_workspace_interaction(student1_id)
        _add_workspace_interaction(student2_id)

        # Feedback 1: Đánh giá cao (5 sao, NPS 10, Sẵn sàng trả 99000đ)
        s1_token = _make_token(student1_id, "student")
        payload1 = {
            "overall_rating": 5,
            "current_plan": "free",
            "aspect_ratings": {"ui": 5},
            "best_thing": "Phản biện xuất sắc",
            "will_recommend": 10,
            "pay_willingness": "99000",
        }
        res1 = await client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {s1_token}"},
            json=payload1,
        )
        assert res1.status_code == 201

        # Feedback 2: Đánh giá thấp (2 sao, NPS 4, Lý do: Chậm, Chọn Free)
        s2_token = _make_token(student2_id, "student")
        payload2 = {
            "overall_rating": 2,
            "current_plan": "free",
            "aspect_ratings": {"ui": 2},
            "low_rating_reasons": ["Thời gian phản hồi chậm"],
            "will_recommend": 4,
            "pay_willingness": "free",
        }
        res2 = await client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {s2_token}"},
            json=payload2,
        )
        assert res2.status_code == 201

        # Lấy lại stats sau khi submit 2 feedback
        updated_stats_resp = await client.get(
            "/api/feedback/stats",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert updated_stats_resp.status_code == 200
        stats = updated_stats_resp.json()

        # 1. Kiểm tra tổng hợp CSAT
        csat = stats["csat"]
        assert csat["total_responses"] == base_csat_total + 2
        assert csat["rating_distribution"]["5"] == base_5_star + 1
        assert csat["rating_distribution"]["2"] == base_2_star + 1
        assert csat["average_score"] > 0
        assert 0 <= csat["satisfied_percentage"] <= 100
        # Lý do đánh giá thấp phải được ghi nhận
        found_reason = any(
            r["reason"] == "Thời gian phản hồi chậm"
            for r in csat["common_low_rating_reasons"]
        )
        assert found_reason is True

        # 2. Kiểm tra tổng hợp NPS
        nps = stats["nps"]
        assert nps["total_nps_responses"] == base_nps_total + 2
        assert nps["promoters_count"] == base_promoters + 1
        assert nps["detractors_count"] == base_detractors + 1
        assert nps["distribution"]["10"] >= 1
        assert nps["distribution"]["4"] >= 1
        assert -100 <= nps["score"] <= 100

        # 3. Kiểm tra Adoption Funnel
        funnel = stats["adoption_funnel"]
        assert funnel["registered_users"] >= 3  # admin + 2 students
        assert "workspaces_users" in funnel
        assert "analysis_users" in funnel
        assert "bookings_users" in funnel
        assert "meetings_users" in funnel
        assert "reports_users" in funnel
        assert "feedback_users" in funnel
        assert "funnel_percentages" in funnel
        for stage in ["workspaces", "analysis", "bookings", "meetings", "reports", "feedbacks"]:
            assert stage in funnel["funnel_percentages"]
            assert 0.0 <= funnel["funnel_percentages"][stage] <= 100.0

        # 4. Kiểm tra Willingness to Pay
        wtp = stats["willingness_to_pay"]
        assert wtp["total_responses"] == base_wtp_total + 2
        assert wtp["paid_count"] == base_wtp_paid + 1
        assert wtp["free_count"] == base_wtp_free + 1
        assert "99000" in wtp["distribution"]
        assert "free" in wtp["distribution"]
        assert 0 <= wtp["paid_percentage"] <= 100

        # Kiểm tra alias route /api/feedback/analytics
        analytics_resp = await client.get(
            "/api/feedback/analytics",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert analytics_resp.status_code == 200
        assert analytics_resp.json()["csat"]["total_responses"] == csat["total_responses"]
    finally:
        _cleanup_user(student1_id)
        _cleanup_user(student2_id)
        _cleanup_user(admin_id)


# ===========================================================================
# 5. Test Experience Gate: Chặn user chưa trải nghiệm tính năng hoặc chỉ có workspace rỗng
# ===========================================================================

@pytest.mark.asyncio
async def test_submit_feedback_rejected_for_zero_features(client: AsyncClient):
    """User mới hoàn toàn (0 tương tác tính năng) bị chặn 403 khi gửi feedback."""
    student_id = _create_user_with_role("student")
    try:
        token = _make_token(student_id, "student")

        # Kiểm tra user-context trả về eligible_for_feedback = False
        ctx_resp = await client.get(
            "/api/feedback/user-context",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert ctx_resp.status_code == 200
        assert ctx_resp.json()["eligible_for_feedback"] is False
        assert len(ctx_resp.json()["detected_features"]) == 0

        # Cố gắng submit khảo sát -> Phải bị chặn 403 Forbidden
        resp = await client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {token}"},
            json={"overall_rating": 5},
        )
        assert resp.status_code == 403
        assert "trải nghiệm và sử dụng ít nhất 1 tính năng" in resp.json()["detail"]
    finally:
        _cleanup_user(student_id)


@pytest.mark.asyncio
async def test_submit_feedback_rejected_for_empty_workspace_and_allowed_after_interaction(client: AsyncClient):
    """User chỉ có Workspace rỗng (chưa hỏi đáp/sinh câu hỏi) bị chặn 403; sau khi có tương tác thì được gửi."""
    student_id = _create_user_with_role("student")
    try:
        # 1. Tạo 1 workspace rỗng (chưa có câu hỏi hay tin nhắn nào)
        with _conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO workspaces (name, user_id, created_at)
                VALUES ('Empty Workspace', %s, now())
                RETURNING id;
                """,
                (student_id,),
            )
            ws_id = cur.fetchone()[0]
            conn.commit()

        token = _make_token(student_id, "student")

        # Context phải báo chưa đủ điều kiện (eligible_for_feedback = False)
        ctx_resp = await client.get(
            "/api/feedback/user-context",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert ctx_resp.status_code == 200
        assert ctx_resp.json()["eligible_for_feedback"] is False
        assert "workspaces" not in ctx_resp.json()["detected_features"]

        # Submit bị chặn 403
        post_resp = await client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {token}"},
            json={"overall_rating": 4},
        )
        assert post_resp.status_code == 403
        assert "trải nghiệm và sử dụng ít nhất 1 tính năng" in post_resp.json()["detail"]

        # 2. Bây giờ thêm 1 tin nhắn vào workspace
        with _conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO messages (workspace_id, role, content, status, created_at)
                VALUES (%s, 'user', 'Xin chao AI', 'completed', now());
                """,
                (ws_id,),
            )
            conn.commit()

        # Context cập nhật eligible_for_feedback = True
        ctx_resp2 = await client.get(
            "/api/feedback/user-context",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert ctx_resp2.status_code == 200
        assert ctx_resp2.json()["eligible_for_feedback"] is True
        assert "workspaces" in ctx_resp2.json()["detected_features"]

        # Submit thành công 201
        post_resp2 = await client.post(
            "/api/feedback",
            headers={"Authorization": f"Bearer {token}"},
            json={"overall_rating": 5, "aspect_ratings": {"ui": 5}},
        )
        assert post_resp2.status_code == 201
        assert post_resp2.json()["success"] is True
        assert post_resp2.json()["mock_ai_trial_tickets"] == 1
    finally:
        _cleanup_user(student_id)

