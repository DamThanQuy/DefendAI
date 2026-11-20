"""Test quyền dùng tính năng theo gói — KHÔNG GỌI AI THẬT, KHÔNG ĐẨY JOB.

Chạy:
    cd apps/api && pytest tests/test_plan_access.py -v --capture=no

Kịch bản:
1. /api/payment/account trả đúng gói và quyền: chưa mua, đang dùng, hết hạn, gói tự tạo, mentor.
2. Mock AI: chỉ VIP; Free và gói hết hạn bị chặn kể cả khi có phiên cũ.
   Vé khảo sát mở đúng 1 phiên, số lượt đếm trên server.
3. Phân tích code: cần Premium trở lên, không đăng nhập thì bị từ chối.
4. Mock Room với mentor: Free chỉ đặt được 1 lịch, lịch bị từ chối/huỷ không tính; gói trả phí không giới hạn.
"""
import asyncio
from datetime import datetime, timedelta
import json
import os
import socket
import sys
from types import SimpleNamespace
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
from app.core.security import create_access_token  # noqa: E402
from app.services.ai_client import ai_gateway  # noqa: E402

PREMIUM = "100002"
VIP = "100003"
ALL_LOCKED = {"mock_ai": False, "code_review": False, "rubric": False}


def _conn():
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _execute(sql: str, *params) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


def _fetch(sql: str, *params) -> list[dict]:
    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def _set_profile(user_id: int, profile: dict) -> None:
    _execute("UPDATE users SET profile_data = %s WHERE id = %s", json.dumps(profile), user_id)


def _profile(user_id: int) -> dict:
    return _fetch("SELECT profile_data FROM users WHERE id = %s", user_id)[0]["profile_data"]


def _give_plan(user_id: int, slug: str, days: int = 30, cycle: str = "monthly") -> None:
    """Giống kết quả thanh toán thật: số ngày âm là gói đã hết hạn (status vẫn "active" vì không có gì đổi nó)."""
    plan = _fetch("SELECT id, name FROM subscription_plans WHERE slug = %s", slug)[0]
    now = datetime.utcnow()
    expires_at = now + timedelta(days=days)
    order = _fetch(
        """
        INSERT INTO payment_orders (order_code, user_id, plan_id, purpose, cycle, amount, proration_credit, method, status, created_at)
        VALUES (%s, %s, %s, 'subscription', %s, 1000, 0, 'payos', 'paid', now())
        RETURNING id
        """,
        uuid.uuid4().hex[:20], user_id, plan["id"], cycle,
    )[0]
    _execute(
        """
        INSERT INTO subscriptions (user_id, plan_id, payment_order_id, starts_at, expires_at, status, created_at)
        VALUES (%s, %s, %s, %s, %s, 'active', now())
        """,
        user_id, plan["id"], order["id"], now - timedelta(days=60), expires_at,
    )
    membership = {
        "plan": "vip" if slug == VIP else "premium" if slug == PREMIUM else slug,
        "cycle": cycle,
        "status": "active",
        "expires_at": expires_at.isoformat(),
    }
    _set_profile(user_id, {**_profile(user_id), "membership": membership})


def _create_session(user_id: int, trial_turns_used: int | None = None) -> int:
    return _fetch(
        """
        INSERT INTO mock_chat_sessions (user_id, document_id, title, message_count, trial_turns_used, created_at, updated_at)
        VALUES (%s, NULL, 'Phiên pytest', 0, %s, now(), now())
        RETURNING id
        """,
        user_id, trial_turns_used,
    )[0]["id"]


def _session_turns(session_id: int) -> int | None:
    return _fetch("SELECT trial_turns_used FROM mock_chat_sessions WHERE id = %s", session_id)[0]["trial_turns_used"]


def _new_user(role: str) -> SimpleNamespace:
    suffix = uuid.uuid4().hex[:12]
    user_id = _fetch(
        """
        INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
        VALUES (%s, %s, 'x', %s, 1, now(), 'email', '{}')
        RETURNING id
        """,
        f"pytest-{suffix}", f"pytest-{suffix}@pytest.local", f"Pytest {role}",
    )[0]["id"]
    rows = _fetch("SELECT id FROM roles WHERE name = %s", role)
    role_id = rows[0]["id"] if rows else _fetch("INSERT INTO roles (name) VALUES (%s) RETURNING id", role)[0]["id"]
    _execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", user_id, role_id)
    token = create_access_token(user_id, role)
    return SimpleNamespace(id=user_id, auth={"Authorization": f"Bearer {token}"})


def _cleanup(user_ids: list[int]) -> None:
    _execute("DELETE FROM mock_bookings WHERE student_id = ANY(%s) OR mentor_id = ANY(%s)", user_ids, user_ids)
    _execute("DELETE FROM mentor_availability WHERE mentor_id = ANY(%s)", user_ids)
    _execute("DELETE FROM subscriptions WHERE user_id = ANY(%s)", user_ids)
    _execute("DELETE FROM payment_orders WHERE user_id = ANY(%s)", user_ids)
    _execute("DELETE FROM mock_chat_messages WHERE user_id = ANY(%s)", user_ids)
    _execute("DELETE FROM mock_chat_sessions WHERE user_id = ANY(%s)", user_ids)
    _execute("DELETE FROM user_roles WHERE user_id = ANY(%s)", user_ids)
    _execute("DELETE FROM users WHERE id = ANY(%s)", user_ids)


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


@pytest.fixture
def users():
    created: list[int] = []

    def _make(role: str = "student") -> SimpleNamespace:
        user = _new_user(role)
        created.append(user.id)
        return user

    yield _make
    if created:
        _cleanup(created)


@pytest.fixture(autouse=True)
def ai(monkeypatch):
    """Không gọi AI thật: `calls` đếm số lần gọi, gán `error` để giả lập AI lỗi."""
    state = SimpleNamespace(calls=0, error=None)

    async def generate(**kwargs):
        state.calls += 1
        if state.error:
            raise state.error
        return {"content": "Câu hỏi phản biện"}

    monkeypatch.setattr(ai_gateway, "generate", generate)
    return state


@pytest.fixture
def mentor(users):
    """Mentor rảnh cả tuần để chỉ còn quy tắc về gói quyết định kết quả đặt lịch."""
    created = users("mentor")
    for day in range(7):
        _execute(
            """
            INSERT INTO mentor_availability (mentor_id, day_of_week, start_time, end_time, is_available, week_pattern)
            VALUES (%s, %s, '00:00', '23:59', true, 'all')
            """,
            created.id, day,
        )
    return created


async def _access(client, user) -> dict:
    r = await client.get("/api/payment/account", headers=user.auth)
    assert r.status_code == 200, r.text
    return r.json()["access"]


async def _chat(client, user, session_id: int | None = None):
    body = {"messages": [{"role": "user", "content": "Em xin trình bày"}]}
    if session_id is not None:
        body["session_id"] = session_id
    return await client.post("/api/mock-qa/chat", json=body, headers=user.auth)


async def _new_session(client, user):
    return await client.post("/api/mock-qa/sessions", json={"title": "Phiên test"}, headers=user.auth)


async def _book(client, user, mentor):
    proposed = (datetime.utcnow() + timedelta(days=2)).replace(hour=3, minute=0, second=0, microsecond=0)
    return await client.post(
        "/api/bookings",
        json={"mentor_id": mentor.id, "proposed_time": proposed.isoformat() + "Z", "title": "Buổi mock"},
        headers=user.auth,
    )


async def _scan(client, headers=None):
    # Tài liệu không tồn tại: vượt qua được kiểm tra gói thì nhận 404, không tạo job nào.
    return await client.post("/api/code/scan", json={"document_id": 999999999}, headers=headers or {})


# ---------------------------------------------------------------------------
# 1. Gói và quyền
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_new_free_account(client, users):
    access = await _access(client, users())

    assert access["plan"] == "free"
    assert access["expired_plan"] is None
    assert access["free_mentor_bookings_left"] == 1
    assert access["features"] == {**ALL_LOCKED, "mentor_booking": True}


@pytest.mark.asyncio
async def test_premium_unlocks_code_and_rubric_but_not_mock_ai(client, users):
    user = users()
    _give_plan(user.id, PREMIUM)

    access = await _access(client, user)

    assert access["plan"] == "premium"
    assert access["features"] == {"mock_ai": False, "code_review": True, "rubric": True, "mentor_booking": True}


@pytest.mark.asyncio
async def test_vip_unlocks_everything(client, users):
    user = users()
    _give_plan(user.id, VIP)

    access = await _access(client, user)

    assert access["plan"] == "vip"
    assert access["features"] == {"mock_ai": True, "code_review": True, "rubric": True, "mentor_booking": True}


@pytest.mark.asyncio
async def test_expired_vip_is_treated_as_free_and_remembers_the_old_plan(client, users):
    user = users()
    _give_plan(user.id, VIP, days=-1)

    r = await client.get("/api/payment/account", headers=user.auth)

    assert r.json()["subscription"] is None
    access = r.json()["access"]
    assert access["plan"] == "free"
    assert access["expired_plan"] == "VIP"
    assert access["features"]["mock_ai"] is False
    assert access["features"]["code_review"] is False


@pytest.mark.asyncio
async def test_expired_plan_name_is_the_last_one_bought(client, users):
    """Mua Premium năm rồi đổi sang VIP tháng: dòng Premium cũ có ngày hết hạn xa hơn nhưng không phải gói gần nhất."""
    user = users()
    _give_plan(user.id, PREMIUM, days=300, cycle="yearly")
    _execute("UPDATE subscriptions SET status = 'expired' WHERE user_id = %s", user.id)
    _give_plan(user.id, VIP, days=-1)

    access = await _access(client, user)

    assert access["plan"] == "free"
    assert access["expired_plan"] == "VIP"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "plan, expires_at, expected",
    [("vip", "2099-01-01T00:00:00", "vip"), ("premium", "2099-01-01T00:00:00", "premium"), ("vip", "2020-01-01T00:00:00", "free")],
    ids=["vip-active", "premium-active", "vip-expired"],
)
async def test_membership_without_a_subscription_row(client, users, plan, expires_at, expected):
    user = users()
    _set_profile(user.id, {"membership": {"plan": plan, "status": "active", "expires_at": expires_at}})

    assert (await _access(client, user))["plan"] == expected


@pytest.mark.asyncio
async def test_custom_plan_counts_as_premium(client, users):
    slug = str(uuid.uuid4().int % 900000 + 100010)
    plan_id = _fetch(
        """
        INSERT INTO subscription_plans (slug, name, tagline, icon, monthly, yearly, featured, special, cta, features, active, sort_order, created_at, updated_at)
        VALUES (%s, %s, '', 'zap', 10000, 100000, false, false, '', '[]', true, 99, now(), now())
        RETURNING id
        """,
        slug, f"Gói Pytest {slug}",
    )[0]["id"]
    user = users()
    try:
        _give_plan(user.id, slug)

        assert (await _access(client, user))["plan"] == "premium"
    finally:
        _execute("DELETE FROM subscriptions WHERE plan_id = %s", plan_id)
        _execute("DELETE FROM payment_orders WHERE plan_id = %s", plan_id)
        _execute("DELETE FROM subscription_plans WHERE id = %s", plan_id)


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["mentor", "admin"])
async def test_staff_are_never_locked(client, users, role):
    access = await _access(client, users(role))

    assert all(access["features"].values())


# ---------------------------------------------------------------------------
# 2. Mock AI
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_free_user_without_ticket_cannot_use_mock_ai(client, ai, users):
    user = users()

    chat = await _chat(client, user)
    session = await _new_session(client, user)

    assert chat.status_code == 403
    assert session.status_code == 403
    assert ai.calls == 0


@pytest.mark.asyncio
async def test_premium_cannot_use_mock_ai(client, ai, users):
    user = users()
    _give_plan(user.id, PREMIUM)

    assert (await _chat(client, user)).status_code == 403
    assert ai.calls == 0


@pytest.mark.asyncio
async def test_expired_vip_with_old_sessions_cannot_chat_but_can_read_them(client, ai, users):
    """Lỗi gốc: VIP hết hạn vẫn được tính là VIP, và ai có phiên cũ thì chat tiếp được mãi."""
    user = users()
    _give_plan(user.id, VIP, days=-1)
    session_id = _create_session(user.id)

    without_id = await _chat(client, user)
    with_id = await _chat(client, user, session_id)
    new_session = await _new_session(client, user)
    detail = await client.get(f"/api/mock-qa/sessions/{session_id}", headers=user.auth)

    assert without_id.status_code == 403
    assert with_id.status_code == 403
    assert new_session.status_code == 403
    assert ai.calls == 0
    assert detail.status_code == 200
    assert detail.json()["can_chat"] is False


@pytest.mark.asyncio
async def test_vip_can_chat_and_sessions_cost_no_ticket(client, ai, users):
    user = users()
    _give_plan(user.id, VIP)
    _set_profile(user.id, {**_profile(user.id), "mock_ai_trial_tickets": 2})

    session = await _new_session(client, user)
    chat = await _chat(client, user, session.json()["id"])

    assert session.status_code == 200, session.text
    assert chat.status_code == 200, chat.text
    assert ai.calls == 1
    assert _profile(user.id)["mock_ai_trial_tickets"] == 2
    assert _session_turns(session.json()["id"]) is None
    detail = await client.get(f"/api/mock-qa/sessions/{session.json()['id']}", headers=user.auth)
    assert detail.json()["can_chat"] is True


@pytest.mark.asyncio
async def test_ticket_opens_exactly_one_session(client, users):
    user = users()
    _set_profile(user.id, {"mock_ai_trial_tickets": 1})

    first = await _new_session(client, user)
    second = await _new_session(client, user)

    assert first.status_code == 200, first.text
    assert first.json()["remaining_tickets"] == 0
    assert _session_turns(first.json()["id"]) == 0
    assert second.status_code == 403
    assert _profile(user.id)["mock_ai_trial_tickets"] == 0


@pytest.mark.asyncio
async def test_one_ticket_cannot_open_two_sessions_at_once(client, users):
    user = users()
    _set_profile(user.id, {"mock_ai_trial_tickets": 1})

    responses = await asyncio.gather(*(_new_session(client, user) for _ in range(4)))

    assert sorted(r.status_code for r in responses) == [200, 403, 403, 403]
    assert _profile(user.id)["mock_ai_trial_tickets"] == 0


@pytest.mark.asyncio
async def test_holding_a_ticket_does_not_allow_chat_outside_a_session(client, ai, users):
    """Vé chỉ bị trừ khi mở phiên: chat không qua phiên sẽ dùng thử mãi mà không tốn vé."""
    user = users()
    _set_profile(user.id, {"mock_ai_trial_tickets": 1})

    assert (await _chat(client, user)).status_code == 403
    assert ai.calls == 0


@pytest.mark.asyncio
async def test_trial_turns_are_counted_on_the_server(client, ai, users):
    """Lỗi gốc: giới hạn đếm từ danh sách tin nhắn do trình duyệt gửi lên, gửi ít đi là không bao giờ hết."""
    user = users()
    _set_profile(user.id, {"mock_ai_trial_tickets": 1})
    session_id = (await _new_session(client, user)).json()["id"]

    allowed = [await _chat(client, user, session_id) for _ in range(6)]
    blocked = await _chat(client, user, session_id)

    assert [r.status_code for r in allowed] == [200] * 6
    assert blocked.status_code == 403
    assert "giới hạn" in blocked.json()["detail"]
    assert ai.calls == 6
    assert _session_turns(session_id) == 6
    detail = await client.get(f"/api/mock-qa/sessions/{session_id}", headers=user.auth)
    assert detail.json()["can_chat"] is False


@pytest.mark.asyncio
async def test_failed_ai_call_does_not_use_a_trial_turn(client, ai, users):
    user = users()
    _set_profile(user.id, {"mock_ai_trial_tickets": 1})
    session_id = (await _new_session(client, user)).json()["id"]
    ai.error = RuntimeError("AI lỗi")

    r = await _chat(client, user, session_id)

    assert r.status_code == 500
    assert _session_turns(session_id) == 0


@pytest.mark.asyncio
async def test_cannot_use_another_users_trial_session(client, ai, users):
    owner, other = users(), users()
    session_id = _create_session(owner.id, trial_turns_used=0)

    assert (await _chat(client, other, session_id)).status_code == 403
    assert _session_turns(session_id) == 0
    assert ai.calls == 0


# ---------------------------------------------------------------------------
# 3. Phân tích code
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_code_scan_requires_login(client):
    assert (await _scan(client)).status_code == 401


@pytest.mark.asyncio
async def test_code_scan_is_locked_for_free_and_expired_plans(client, users):
    free, expired = users(), users()
    _give_plan(expired.id, PREMIUM, days=-1)

    assert (await _scan(client, free.auth)).status_code == 403
    assert (await _scan(client, expired.auth)).status_code == 403


@pytest.mark.asyncio
async def test_code_scan_is_open_for_paid_plans_and_mentors(client, users):
    premium, vip, mentor = users(), users(), users("mentor")
    _give_plan(premium.id, PREMIUM)
    _give_plan(vip.id, VIP)

    assert (await _scan(client, premium.auth)).status_code == 404
    assert (await _scan(client, vip.auth)).status_code == 404
    assert (await _scan(client, mentor.auth)).status_code == 404


# ---------------------------------------------------------------------------
# 4. Mock Room với mentor
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_free_account_can_book_a_mentor_exactly_once(client, users, mentor):
    user = users()

    first = await _book(client, user, mentor)
    access = await _access(client, user)
    second = await _book(client, user, mentor)

    assert first.status_code == 201, first.text
    assert access["free_mentor_bookings_left"] == 0
    assert access["features"]["mentor_booking"] is False
    assert second.status_code == 403
    assert "mua gói" in second.json()["detail"].lower()
    assert len(_fetch("SELECT id FROM mock_bookings WHERE student_id = %s", user.id)) == 1


@pytest.mark.asyncio
async def test_two_requests_at_once_still_book_only_once(client, users, mentor):
    user = users()

    responses = await asyncio.gather(*(_book(client, user, mentor) for _ in range(4)))

    assert sorted(r.status_code for r in responses) == [201, 403, 403, 403]


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["rejected", "cancelled"])
async def test_rejected_or_cancelled_booking_gives_the_free_use_back(client, users, mentor, status):
    user = users()
    booking_id = (await _book(client, user, mentor)).json()["id"]
    _execute("UPDATE mock_bookings SET status = %s WHERE id = %s", status, booking_id)

    assert (await _access(client, user))["free_mentor_bookings_left"] == 1
    assert (await _book(client, user, mentor)).status_code == 201


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["confirmed", "completed"])
async def test_confirmed_or_completed_booking_uses_the_free_use(client, users, mentor, status):
    user = users()
    booking_id = (await _book(client, user, mentor)).json()["id"]
    _execute("UPDATE mock_bookings SET status = %s WHERE id = %s", status, booking_id)

    assert (await _book(client, user, mentor)).status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("slug", [PREMIUM, VIP])
async def test_paid_plans_book_without_limit(client, users, mentor, slug):
    user = users()
    _give_plan(user.id, slug)

    responses = [await _book(client, user, mentor) for _ in range(3)]

    assert [r.status_code for r in responses] == [201, 201, 201]


@pytest.mark.asyncio
async def test_buying_a_plan_unlocks_booking_again(client, users, mentor):
    user = users()
    await _book(client, user, mentor)
    assert (await _book(client, user, mentor)).status_code == 403

    _give_plan(user.id, PREMIUM)

    assert (await _book(client, user, mentor)).status_code == 201


@pytest.mark.asyncio
async def test_expired_plan_is_locked_once_the_free_use_is_gone(client, users, mentor):
    used, unused = users(), users()
    _give_plan(used.id, VIP)
    assert (await _book(client, used, mentor)).status_code == 201
    _execute("DELETE FROM subscriptions WHERE user_id = %s", used.id)
    _give_plan(used.id, VIP, days=-1)
    _give_plan(unused.id, VIP, days=-1)

    assert (await _book(client, used, mentor)).status_code == 403
    assert (await _book(client, unused, mentor)).status_code == 201


@pytest.mark.asyncio
async def test_locked_account_keeps_seeing_its_existing_booking(client, users, mentor):
    user = users()
    await _book(client, user, mentor)

    r = await client.get("/api/bookings/mine", headers=user.auth)

    assert r.status_code == 200
    assert len(r.json()) == 1
