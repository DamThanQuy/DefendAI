"""Test quên mật khẩu / đặt lại mật khẩu bằng mã OTP — KHÔNG CẦN UI, KHÔNG GỬI MAIL THẬT.

Chạy:
    cd apps/api && pytest tests/test_password_reset.py -v --capture=no

Cách hoạt động:
- Gọi API qua httpx.AsyncClient + ASGITransport (in-process, không cần server chạy).
- DB thật (DATABASE_URL trong .env — Postgres localhost:5433) — user tạo ra
  được cleanup sau mỗi test.
- Hàm gửi mail được thay bằng stub (fixture `outbox`), phần dựng nội dung mail
  test riêng với smtplib giả.

Kịch bản:
1. Quên mật khẩu: gửi mã 6 số, DB chỉ lưu HMAC, không lộ email nào đã đăng ký,
   chưa cấu hình SMTP thì báo 503, chống spam theo phút và theo giờ, kể cả gửi đồng thời.
2. Kiểm tra mã (bước trước khi nhập mật khẩu): đúng thì chưa dùng mã và chưa đổi gì,
   gia hạn cho mã sắp hết hạn; sai / hết hạn / mã cũ bị từ chối.
3. Đặt lại: đổi được mật khẩu, thu hồi phiên cũ, mã dùng một lần, mã cũ / hết hạn
   bị từ chối dù đã qua bước kiểm tra, mật khẩu yếu bị từ chối mà không mất lượt thử.
4. Chống đoán mã: nhập sai 5 lần thì huỷ mã, tính chung cả 2 endpoint, kể cả đoán đồng
   thời; mã của tài khoản này không dùng được cho tài khoản khác; lỗi không lộ email.
5. Tài khoản bị khoá và tài khoản chỉ có Google.
6. Nội dung email: có mã, không có link, tiêu đề không chứa mã, escape HTML,
   luôn bật TLS khi cấu hình gõ sai.
"""
import asyncio
from datetime import datetime, timedelta
from hashlib import sha256
import os
import re
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
from app.core import security  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.routers import auth as auth_router  # noqa: E402
from app.services import email_service  # noqa: E402

OLD_PASSWORD = "OldPass1!"
NEW_PASSWORD = "NewPass2@"


def _conn():
    url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def _execute(sql: str, *params) -> None:
    with _conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


def _otp_rows(user_id: int) -> list[dict]:
    with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM password_reset_otps WHERE user_id = %s ORDER BY id", (user_id,)
        )
        return cur.fetchall()


def _backdate_otps(user_id: int) -> None:
    """Đẩy thời điểm gửi lùi 2 phút để vượt qua giới hạn 1 email/phút."""
    _execute(
        "UPDATE password_reset_otps SET created_at = created_at - interval '2 minutes' "
        "WHERE user_id = %s",
        user_id,
    )


def _cleanup_user(user_id: int) -> None:
    _execute("DELETE FROM refresh_tokens WHERE user_id = %s", user_id)
    _execute("DELETE FROM user_roles WHERE user_id = %s", user_id)
    _execute("DELETE FROM users WHERE id = %s", user_id)  # password_reset_otps: ON DELETE CASCADE


def _wrong_otp(otp: str) -> str:
    return f"{(int(otp) + 1) % 1_000_000:06d}"


async def _register(client) -> SimpleNamespace:
    email = f"pytest-reset-{uuid.uuid4().hex[:10]}@gmail.com"
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": OLD_PASSWORD, "full_name": "Pytest Reset User"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return SimpleNamespace(id=int(data["user"]["id"]), email=email, refresh_token=data["refresh_token"])


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


@pytest_asyncio.fixture
async def account(client):
    user = await _register(client)
    yield user
    _cleanup_user(user.id)


@pytest.fixture
def outbox(monkeypatch):
    """Thay việc gửi mail thật bằng danh sách ghi nhận."""
    sent: list[SimpleNamespace] = []
    monkeypatch.setattr(auth_router, "is_email_configured", lambda: True)
    monkeypatch.setattr(
        auth_router,
        "send_password_reset_email",
        lambda to, full_name, otp: sent.append(SimpleNamespace(to=to, full_name=full_name, otp=otp)),
    )
    return sent


async def _forgot(client, email: str):
    return await client.post("/api/auth/forgot-password", json={"email": email})


async def _verify(client, email: str, otp: str):
    return await client.post("/api/auth/verify-reset-otp", json={"email": email, "otp": otp})


async def _reset(client, email: str, otp: str, password: str = NEW_PASSWORD):
    return await client.post(
        "/api/auth/reset-password", json={"email": email, "otp": otp, "new_password": password}
    )


async def _login_status(client, email: str, password: str) -> int:
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    return r.status_code


# ---------------------------------------------------------------------------
# 1. Quên mật khẩu
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_forgot_password_sends_otp_and_stores_only_keyed_hash(client, outbox, account):
    r = await _forgot(client, account.email)

    assert r.status_code == 200, r.text
    assert r.json()["resend_after_seconds"] == 60
    assert len(outbox) == 1
    assert outbox[0].to == account.email
    assert re.fullmatch(r"[0-9]{6}", outbox[0].otp)

    rows = _otp_rows(account.id)
    assert len(rows) == 1
    assert rows[0]["code_hash"] == security.hash_password_reset_otp(account.id, outbox[0].otp)
    assert outbox[0].otp not in rows[0].values()
    # SHA-256 thuần của 1 triệu mã dò ngược được ngay, nên hash phải dùng khoá bí mật.
    assert rows[0]["code_hash"] != sha256(outbox[0].otp.encode()).hexdigest()
    assert rows[0]["used_at"] is None
    assert rows[0]["failed_attempts"] == 0
    assert timedelta(minutes=9) < rows[0]["expires_at"] - rows[0]["created_at"] <= timedelta(minutes=10)


def test_otp_keeps_leading_zeros(monkeypatch):
    monkeypatch.setattr(security, "randbelow", lambda _: 42)

    otp, code_hash = security.create_password_reset_otp(1)

    assert otp == "000042"
    assert security.password_reset_otp_matches(1, "000042", code_hash)
    assert not security.password_reset_otp_matches(2, "000042", code_hash)


@pytest.mark.asyncio
async def test_forgot_password_unknown_email_gets_same_response(client, outbox, account):
    known = await _forgot(client, account.email)
    unknown = await _forgot(client, f"pytest-nobody-{uuid.uuid4().hex[:10]}@gmail.com")

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert len(outbox) == 1


@pytest.mark.asyncio
async def test_forgot_password_ignores_case_and_sends_to_stored_address(client, outbox, account):
    r = await _forgot(client, f"  {account.email.upper()} ")

    assert r.status_code == 200, r.text
    assert [mail.to for mail in outbox] == [account.email]


@pytest.mark.asyncio
async def test_forgot_password_without_smtp_returns_503(client, monkeypatch, account):
    monkeypatch.setattr(settings.smtp, "host", "")

    r = await _forgot(client, account.email)

    assert r.status_code == 503
    assert _otp_rows(account.id) == []


@pytest.mark.asyncio
async def test_second_request_within_a_minute_sends_nothing_and_keeps_code(client, outbox, account):
    await _forgot(client, account.email)
    r = await _forgot(client, account.email)

    assert r.status_code == 200
    assert len(outbox) == 1
    assert (await _reset(client, account.email, outbox[0].otp)).status_code == 200


@pytest.mark.asyncio
async def test_concurrent_requests_cannot_bypass_email_limit(client, outbox, account):
    responses = await asyncio.gather(*(_forgot(client, account.email) for _ in range(8)))

    assert {r.status_code for r in responses} == {200}
    assert len(outbox) == 1
    assert len(_otp_rows(account.id)) == 1


@pytest.mark.asyncio
async def test_at_most_five_emails_per_hour(client, outbox, account):
    for _ in range(7):
        await _forgot(client, account.email)
        _backdate_otps(account.id)

    assert len(outbox) == 5


# ---------------------------------------------------------------------------
# 2. Kiểm tra mã trước khi nhập mật khẩu
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_verify_accepts_correct_code_without_using_it_or_changing_anything(client, outbox, account):
    await _forgot(client, account.email)

    first = await _verify(client, f"  {account.email.upper()} ", outbox[0].otp)
    second = await _verify(client, account.email, outbox[0].otp)

    assert first.status_code == second.status_code == 200, first.text
    row = _otp_rows(account.id)[0]
    assert row["used_at"] is None
    assert row["failed_attempts"] == 0
    assert await _login_status(client, account.email, OLD_PASSWORD) == 200
    refresh = await client.post("/api/auth/refresh", json={"refresh_token": account.refresh_token})
    assert refresh.status_code == 200

    assert (await _reset(client, account.email, outbox[0].otp)).status_code == 200


@pytest.mark.asyncio
async def test_verify_extends_a_code_about_to_expire(client, outbox, account):
    await _forgot(client, account.email)
    _execute(
        "UPDATE password_reset_otps SET expires_at = %s WHERE user_id = %s",
        datetime.utcnow() + timedelta(seconds=5),
        account.id,
    )

    r = await _verify(client, account.email, outbox[0].otp)

    assert r.status_code == 200, r.text
    assert _otp_rows(account.id)[0]["expires_at"] - datetime.utcnow() > timedelta(minutes=9)


@pytest.mark.asyncio
async def test_failed_verify_does_not_extend_the_code(client, outbox, account):
    await _forgot(client, account.email)
    soon = datetime.utcnow() + timedelta(minutes=1)
    _execute("UPDATE password_reset_otps SET expires_at = %s WHERE user_id = %s", soon, account.id)

    r = await _verify(client, account.email, _wrong_otp(outbox[0].otp))

    assert r.status_code == 400
    assert _otp_rows(account.id)[0]["expires_at"] == soon


@pytest.mark.asyncio
async def test_verify_rejects_expired_code(client, outbox, account):
    await _forgot(client, account.email)
    _execute(
        "UPDATE password_reset_otps SET expires_at = %s WHERE user_id = %s",
        datetime.utcnow() - timedelta(minutes=1),
        account.id,
    )

    r = await _verify(client, account.email, outbox[0].otp)

    assert r.status_code == 400
    assert _otp_rows(account.id)[0]["expires_at"] < datetime.utcnow()


@pytest.mark.asyncio
async def test_verify_rejects_previous_code_after_a_new_request(client, outbox, account):
    await _forgot(client, account.email)
    _backdate_otps(account.id)
    await _forgot(client, account.email)
    assert len(outbox) == 2

    if outbox[0].otp != outbox[1].otp:
        assert (await _verify(client, account.email, outbox[0].otp)).status_code == 400
    assert (await _verify(client, account.email, outbox[1].otp)).status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_otp", ["12345", "abcdef"], ids=["short", "letters"])
async def test_verify_rejects_malformed_code_without_using_an_attempt(client, outbox, account, bad_otp):
    await _forgot(client, account.email)

    r = await _verify(client, account.email, bad_otp)

    assert r.status_code == 422
    assert "6 chữ số" in r.text
    assert _otp_rows(account.id)[0]["failed_attempts"] == 0


# ---------------------------------------------------------------------------
# 3. Đặt lại mật khẩu
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reset_after_verify_changes_password(client, outbox, account):
    await _forgot(client, account.email)
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 200

    r = await _reset(client, account.email, outbox[0].otp)

    assert r.status_code == 200, r.text
    assert await _login_status(client, account.email, OLD_PASSWORD) == 401
    assert await _login_status(client, account.email, NEW_PASSWORD) == 200
    # Mã đã dùng thì cả 2 bước đều từ chối.
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 400


@pytest.mark.asyncio
async def test_reset_checks_the_code_again_even_after_verify(client, outbox, account):
    """Server không tin client đã qua bước kiểm tra: gọi thẳng reset với mã sai vẫn bị từ chối."""
    await _forgot(client, account.email)
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 200

    r = await _reset(client, account.email, _wrong_otp(outbox[0].otp))

    assert r.status_code == 400
    assert _otp_rows(account.id)[0]["failed_attempts"] == 1
    assert await _login_status(client, account.email, OLD_PASSWORD) == 200


@pytest.mark.asyncio
async def test_new_request_invalidates_a_code_that_was_already_verified(client, outbox, account):
    await _forgot(client, account.email)
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 200
    _backdate_otps(account.id)
    await _forgot(client, account.email)
    assert len(outbox) == 2

    if outbox[0].otp != outbox[1].otp:
        assert (await _reset(client, account.email, outbox[0].otp)).status_code == 400
        assert await _login_status(client, account.email, OLD_PASSWORD) == 200


@pytest.mark.asyncio
async def test_reset_changes_password_revokes_sessions_and_is_single_use(client, outbox, account):
    await _forgot(client, account.email)

    r = await _reset(client, account.email, outbox[0].otp)

    assert r.status_code == 200, r.text
    assert await _login_status(client, account.email, OLD_PASSWORD) == 401
    assert await _login_status(client, account.email, NEW_PASSWORD) == 200

    refresh = await client.post("/api/auth/refresh", json={"refresh_token": account.refresh_token})
    assert refresh.status_code == 401

    reused = await _reset(client, account.email, outbox[0].otp, "Another3#")
    assert reused.status_code == 400
    assert await _login_status(client, account.email, NEW_PASSWORD) == 200


@pytest.mark.asyncio
async def test_concurrent_resets_with_correct_code_succeed_only_once(client, outbox, account):
    await _forgot(client, account.email)

    responses = await asyncio.gather(
        *(_reset(client, account.email, outbox[0].otp, f"NewPass{i}@") for i in range(4))
    )

    assert sorted(r.status_code for r in responses) == [200, 400, 400, 400]


@pytest.mark.asyncio
async def test_new_request_invalidates_previous_code(client, outbox, account):
    await _forgot(client, account.email)
    _backdate_otps(account.id)
    await _forgot(client, account.email)
    assert len(outbox) == 2

    if outbox[0].otp != outbox[1].otp:
        assert (await _reset(client, account.email, outbox[0].otp)).status_code == 400
    assert (await _reset(client, account.email, outbox[1].otp)).status_code == 200


@pytest.mark.asyncio
async def test_expired_code_is_rejected(client, outbox, account):
    await _forgot(client, account.email)
    _execute(
        "UPDATE password_reset_otps SET expires_at = now() - interval '1 minute' WHERE user_id = %s",
        account.id,
    )

    r = await _reset(client, account.email, outbox[0].otp)

    assert r.status_code == 400
    assert await _login_status(client, account.email, OLD_PASSWORD) == 200


@pytest.mark.asyncio
async def test_otp_pasted_with_spaces_is_accepted(client, outbox, account):
    await _forgot(client, account.email)
    otp = outbox[0].otp

    r = await _reset(client, account.email, f" {otp[:3]} {otp[3:]} ")

    assert r.status_code == 200, r.text


@pytest.mark.asyncio
@pytest.mark.parametrize("bad_otp", ["12345", "1234567", "abcdef", "١٢٣٤٥٦"], ids=["short", "long", "letters", "non-ascii-digits"])
async def test_malformed_otp_is_rejected_without_using_an_attempt(client, outbox, account, bad_otp):
    await _forgot(client, account.email)

    r = await _reset(client, account.email, bad_otp)

    assert r.status_code == 422
    assert "6 chữ số" in r.text
    assert _otp_rows(account.id)[0]["failed_attempts"] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "weak_password",
    ["Ab1!", "abcdefg1!", "ABCDEFG1!", "Abcdefgh!", "Abcdefg12"],
    ids=["too-short", "no-upper", "no-lower", "no-digit", "no-symbol"],
)
async def test_weak_password_is_rejected_and_code_stays_valid(client, outbox, account, weak_password):
    await _forgot(client, account.email)

    r = await _reset(client, account.email, outbox[0].otp, weak_password)

    assert r.status_code == 422
    assert "Mật khẩu phải có" in r.text
    assert _otp_rows(account.id)[0]["failed_attempts"] == 0
    assert await _login_status(client, account.email, OLD_PASSWORD) == 200
    assert (await _reset(client, account.email, outbox[0].otp)).status_code == 200


# ---------------------------------------------------------------------------
# 4. Chống đoán mã
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_five_wrong_verifies_cancel_the_code(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)

    for _ in range(5):
        assert (await _verify(client, account.email, wrong)).status_code == 400

    assert _otp_rows(account.id)[0]["used_at"] is not None
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 400
    assert (await _reset(client, account.email, outbox[0].otp)).status_code == 400
    assert await _login_status(client, account.email, OLD_PASSWORD) == 200


@pytest.mark.asyncio
async def test_wrong_attempts_on_verify_and_reset_count_together(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)

    for _ in range(3):
        await _verify(client, account.email, wrong)
    for _ in range(2):
        await _reset(client, account.email, wrong)

    row = _otp_rows(account.id)[0]
    assert row["failed_attempts"] == 5
    assert row["used_at"] is not None
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 400


@pytest.mark.asyncio
async def test_successful_verify_does_not_reset_the_attempt_counter(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)

    for _ in range(4):
        await _verify(client, account.email, wrong)
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 200
    assert _otp_rows(account.id)[0]["failed_attempts"] == 4

    await _verify(client, account.email, wrong)

    assert _otp_rows(account.id)[0]["used_at"] is not None


@pytest.mark.asyncio
async def test_concurrent_wrong_verifies_cannot_exceed_attempt_limit(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)

    responses = await asyncio.gather(*(_verify(client, account.email, wrong) for _ in range(12)))

    assert {r.status_code for r in responses} == {400}
    row = _otp_rows(account.id)[0]
    assert row["failed_attempts"] == 5
    assert row["used_at"] is not None
    assert (await _verify(client, account.email, outbox[0].otp)).status_code == 400


@pytest.mark.asyncio
async def test_correct_code_still_works_after_four_wrong_attempts(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)

    for attempt in range(1, 5):
        assert (await _reset(client, account.email, wrong)).status_code == 400
        assert _otp_rows(account.id)[0]["failed_attempts"] == attempt
    assert await _login_status(client, account.email, OLD_PASSWORD) == 200

    assert (await _reset(client, account.email, outbox[0].otp)).status_code == 200


@pytest.mark.asyncio
async def test_five_wrong_attempts_cancel_the_code(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)

    for _ in range(5):
        assert (await _reset(client, account.email, wrong)).status_code == 400

    r = await _reset(client, account.email, outbox[0].otp)

    assert r.status_code == 400
    assert _otp_rows(account.id)[0]["used_at"] is not None
    assert await _login_status(client, account.email, OLD_PASSWORD) == 200


@pytest.mark.asyncio
async def test_concurrent_guesses_cannot_exceed_attempt_limit(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)

    responses = await asyncio.gather(*(_reset(client, account.email, wrong) for _ in range(12)))

    assert {r.status_code for r in responses} == {400}
    row = _otp_rows(account.id)[0]
    assert row["failed_attempts"] == 5
    assert row["used_at"] is not None
    assert (await _reset(client, account.email, outbox[0].otp)).status_code == 400


@pytest.mark.asyncio
async def test_new_code_after_lockout_works(client, outbox, account):
    await _forgot(client, account.email)
    wrong = _wrong_otp(outbox[0].otp)
    for _ in range(5):
        await _reset(client, account.email, wrong)
    _backdate_otps(account.id)

    await _forgot(client, account.email)

    assert len(outbox) == 2
    assert (await _reset(client, account.email, outbox[1].otp)).status_code == 200


@pytest.mark.asyncio
async def test_code_of_one_account_cannot_reset_another(client, outbox, account):
    other = await _register(client)
    try:
        await _forgot(client, account.email)
        await _forgot(client, other.email)
        assert [mail.to for mail in outbox] == [account.email, other.email]

        if outbox[0].otp != outbox[1].otp:
            assert (await _reset(client, other.email, outbox[0].otp)).status_code == 400
            assert await _login_status(client, other.email, OLD_PASSWORD) == 200
    finally:
        _cleanup_user(other.id)


@pytest.mark.asyncio
async def test_failure_response_does_not_reveal_whether_email_exists(client, outbox, account):
    await _forgot(client, account.email)

    nobody = f"pytest-nobody-{uuid.uuid4().hex[:10]}@gmail.com"
    wrong = _wrong_otp(outbox[0].otp)

    for call in (_reset, _verify):
        wrong_code = await call(client, account.email, wrong)
        unknown_email = await call(client, nobody, "123456")

        assert wrong_code.status_code == unknown_email.status_code == 400
        assert wrong_code.json() == unknown_email.json()


# ---------------------------------------------------------------------------
# 5. Tài khoản đặc biệt
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_inactive_account_gets_no_email_and_cannot_use_old_code(client, outbox, account):
    await _forgot(client, account.email)
    _execute("UPDATE users SET is_active = 0 WHERE id = %s", account.id)
    _backdate_otps(account.id)

    await _forgot(client, account.email)
    verified = await _verify(client, account.email, outbox[0].otp)
    r = await _reset(client, account.email, outbox[0].otp)

    assert len(outbox) == 1
    assert verified.status_code == 400
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_google_only_account_can_set_a_password(client, outbox, account):
    _execute(
        "UPDATE users SET hashed_password = NULL, auth_provider = 'google' WHERE id = %s",
        account.id,
    )

    await _forgot(client, account.email)
    r = await _reset(client, account.email, outbox[0].otp)

    assert r.status_code == 200, r.text
    assert await _login_status(client, account.email, NEW_PASSWORD) == 200


# ---------------------------------------------------------------------------
# 6. Nội dung email (smtplib giả)
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_smtp(monkeypatch):
    calls = SimpleNamespace(server=None, starttls=False, login=None, message=None)

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.server = (host, port)

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def starttls(self, context):
            calls.starttls = True

        def login(self, username, password):
            calls.login = (username, password)

        def send_message(self, message):
            calls.message = message

    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    for name, value in {
        "host": "smtp.example.com",
        "port": 587,
        "username": "mailer@example.com",
        "password": "app-password",
        "from_address": "GraduAI <noreply@example.com>",
        "security": "starttls",
    }.items():
        monkeypatch.setattr(settings.smtp, name, value)
    return calls


def test_reset_email_shows_code_without_link_and_escapes_name(fake_smtp):
    email_service.send_password_reset_email("user@example.com", "<b>Piggy</b>", "042137")

    message = fake_smtp.message
    assert fake_smtp.server == ("smtp.example.com", 587)
    assert fake_smtp.starttls is True
    assert fake_smtp.login == ("mailer@example.com", "app-password")
    assert message["To"] == "user@example.com"
    assert message["From"] == "GraduAI <noreply@example.com>"
    assert message["Subject"] == "Mã xác nhận đặt lại mật khẩu GraduAI"

    text_body = message.get_body(preferencelist=("plain",)).get_content()
    html_body = message.get_body(preferencelist=("html",)).get_content()
    assert "042137" in text_body
    assert "042137" in html_body
    assert "10 phút" in text_body
    assert "http" not in text_body
    assert "<a " not in html_body
    assert "<b>Piggy</b>" not in html_body
    assert "&lt;b&gt;Piggy&lt;/b&gt;" in html_body


def test_mistyped_security_setting_still_uses_starttls(fake_smtp, monkeypatch):
    monkeypatch.setattr(settings.smtp, "security", "tls")

    email_service.send_password_reset_email("user@example.com", None, "042137")

    assert fake_smtp.starttls is True


def test_smtp_failure_is_logged_not_raised(monkeypatch, fake_smtp):
    logged: list[str] = []

    def explode(*args, **kwargs):
        raise OSError("smtp down")

    monkeypatch.setattr(email_service, "send_email", explode)
    monkeypatch.setattr(email_service.logger, "exception", logged.append)

    email_service.send_password_reset_email("user@example.com", None, "042137")

    assert len(logged) == 1
    assert "042137" not in logged[0]
