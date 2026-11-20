"""Test giá gói subscription và luồng thanh toán — KHÔNG CẦN UI, KHÔNG GỌI PAYOS THẬT.

Chạy:
    cd apps/api && pytest tests/test_subscription_pricing.py -v --capture=no

Cách hoạt động:
- Gọi API qua httpx.AsyncClient + ASGITransport (in-process, không cần server chạy).
- DB thật (DATABASE_URL trong .env — Postgres localhost:5433) — gói và user tạo ra
  được cleanup sau mỗi test.
- payos_service được thay bằng stub (fixture `payos`), không có request nào ra ngoài.

Kịch bản:
1. Quản lý gói: giá năm nhập riêng, lưu gói không ghi đè giá năm, chặn giá vô lý,
   không xóa được gói đã có đơn.
2. Tạo đơn: số tiền lấy đúng từ gói, chốt vào payment_orders, mã gói lạ / gói đã tắt bị từ chối.
3. Xác nhận đơn: kích hoạt đúng gói + chu kỳ + số tiền của đơn, gọi lại không gia hạn thêm,
   người khác không kích hoạt được, PayOS báo sai số tiền thì không kích hoạt.
4. Webhook PayOS và xác nhận Sandbox.
5. Mua tiếp khi đang có gói: cùng gói thì cộng dồn thời gian còn lại, đổi gói thì tính từ lúc thanh toán.
"""
import asyncio
from datetime import datetime, timedelta
import itertools
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
from app.services.payos_service import payos_service  # noqa: E402

MONTHLY = 50000
YEARLY = 450000


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


def _order(code: int) -> dict | None:
    rows = _fetch("SELECT * FROM payment_orders WHERE order_code = %s", str(code))
    return rows[0] if rows else None


def _subscriptions(user_id: int) -> list[dict]:
    return _fetch("SELECT * FROM subscriptions WHERE user_id = %s ORDER BY id", user_id)


def _cleanup_user(user_id: int) -> None:
    _execute("DELETE FROM subscriptions WHERE user_id = %s", user_id)
    _execute("DELETE FROM payment_orders WHERE user_id = %s", user_id)
    _execute("DELETE FROM refresh_tokens WHERE user_id = %s", user_id)
    _execute("DELETE FROM user_roles WHERE user_id = %s", user_id)
    _execute("DELETE FROM users WHERE id = %s", user_id)


def _create_plan(name: str | None = None, monthly: int = MONTHLY, yearly: int = YEARLY, active: bool = True) -> SimpleNamespace:
    suffix = uuid.uuid4().hex[:6]
    slug = str(int(suffix, 16) % 900000 + 100010)
    name = name or f"Pytest {suffix}"
    rows = _fetch(
        """
        INSERT INTO subscription_plans
            (slug, name, tagline, icon, monthly, yearly, featured, special, cta, features, active, sort_order, created_at, updated_at)
        VALUES (%s, %s, '', 'zap', %s, %s, false, false, '', '[]', %s, 99, now(), now())
        RETURNING id
        """,
        slug, name, monthly, yearly, active,
    )
    return SimpleNamespace(id=rows[0]["id"], slug=slug, name=name, monthly=monthly, yearly=yearly)


def _delete_plan(plan_id: int) -> None:
    _execute("DELETE FROM subscriptions WHERE plan_id = %s", plan_id)
    _execute("DELETE FROM payment_orders WHERE plan_id = %s", plan_id)
    _execute("DELETE FROM subscription_plans WHERE id = %s", plan_id)


async def _register(client) -> SimpleNamespace:
    email = f"pytest-price-{uuid.uuid4().hex[:10]}@gmail.com"
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "OldPass1!", "full_name": "Pytest Price"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return SimpleNamespace(
        id=int(data["user"]["id"]),
        email=email,
        auth={"Authorization": f"Bearer {data['token']}"},
    )


@pytest_asyncio.fixture
async def client():
    await app_db.engine.dispose()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    await app_db.engine.dispose()


@pytest_asyncio.fixture
async def buyer(client):
    user = await _register(client)
    yield user
    _cleanup_user(user.id)


@pytest_asyncio.fixture
async def other_user(client):
    user = await _register(client)
    yield user
    _cleanup_user(user.id)


@pytest.fixture
def admin():
    suffix = uuid.uuid4().hex[:12]
    rows = _fetch(
        """
        INSERT INTO users (username, email, hashed_password, full_name, is_active, created_at, auth_provider, profile_data)
        VALUES (%s, %s, 'x', 'Pytest Admin', 1, now(), 'email', '{}')
        RETURNING id
        """,
        f"pytest-admin-{suffix}", f"pytest-admin-{suffix}@pytest.local",
    )
    user_id = rows[0]["id"]
    role = _fetch("SELECT id FROM roles WHERE name = 'admin'")
    role_id = role[0]["id"] if role else _fetch("INSERT INTO roles (name) VALUES ('admin') RETURNING id")[0]["id"]
    _execute("INSERT INTO user_roles (user_id, role_id) VALUES (%s, %s)", user_id, role_id)
    token = create_access_token(user_id, "admin")
    yield SimpleNamespace(id=user_id, auth={"Authorization": f"Bearer {token}"})
    _cleanup_user(user_id)


@pytest.fixture
def plan():
    created = _create_plan()
    yield created
    _delete_plan(created.id)


@pytest.fixture(autouse=True)
def payos(monkeypatch):
    """Không gọi PayOS thật: `links` ghi lại link đã tạo, `paid` là trạng thái PayOS trả về theo mã đơn."""
    state = SimpleNamespace(links=[], paid={})

    async def create_link(**kwargs):
        state.links.append(kwargs)
        return {
            "success": True,
            "orderCode": kwargs["order_code"],
            "amount": kwargs["amount"],
            "checkoutUrl": "https://pay.example.com/link",
            "qrCode": "000201test",
            "status": "PENDING",
            "isSandbox": False,
        }

    async def link_info(order_code):
        return state.paid.get(order_code, {})

    monkeypatch.setattr(payos_service, "create_payment_link", create_link)
    monkeypatch.setattr(payos_service, "get_payment_link_information", link_info)
    monkeypatch.setattr(payos_service, "is_configured", lambda: True)
    monkeypatch.setattr(payos_service, "verify_webhook_signature", lambda data, signature: signature == "valid")
    return state


@pytest.fixture(autouse=True)
def distinct_order_codes(monkeypatch):
    """Mã đơn chỉ có 100 giá trị mỗi giây: tạo liên tiếp nhiều đơn trong test có thể trùng ngẫu nhiên."""
    counter = itertools.count()
    monkeypatch.setattr("app.routers.payment.secrets.randbelow", lambda limit: next(counter) % limit)


async def _create_order(client, user, plan_id: str, cycle: str = "yearly"):
    return await client.post(
        "/api/payment/create-order",
        json={"plan_id": plan_id, "cycle": cycle, "method": "payos"},
        headers=user.auth,
    )


async def _status(client, user, code: int):
    return await client.get(f"/api/payment/order-status/{code}", headers=user.auth)


def _plan_payload(**overrides) -> dict:
    return {
        "name": f"Pytest {uuid.uuid4().hex[:6]}",
        "tagline": "",
        "price": 99000,
        "yearly": 990000,
        "features": [],
        **overrides,
    }


# ---------------------------------------------------------------------------
# 1. Quản lý gói
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_admin_saves_yearly_price_separately(client, admin):
    r = await client.post("/api/admin/subscriptions", json=_plan_payload(), headers=admin.auth)
    assert r.status_code == 200, r.text
    created = r.json()["plan"]
    try:
        assert created["monthly"] == 99000
        assert created["yearly"] == 990000

        public = (await client.get("/api/subscriptions/plans")).json()["plans"]
        listed = next(item for item in public if item["slug"] == created["slug"])
        assert (listed["price"], listed["monthly"], listed["yearly"]) == (99000, 99000, 990000)
    finally:
        _delete_plan(created["id"])


@pytest.mark.asyncio
async def test_editing_a_plan_does_not_overwrite_yearly_price(client, admin, plan):
    """Lỗi gốc: chỉ sửa mô tả cũng làm giá năm bị ghi đè bằng giá tháng."""
    r = await client.put(
        f"/api/admin/subscriptions/{plan.id}",
        json=_plan_payload(name=plan.name, tagline="Mô tả mới", price=MONTHLY, yearly=YEARLY),
        headers=admin.auth,
    )

    assert r.status_code == 200, r.text
    row = _fetch("SELECT monthly, yearly, tagline FROM subscription_plans WHERE id = %s", plan.id)[0]
    assert row == {"monthly": MONTHLY, "yearly": YEARLY, "tagline": "Mô tả mới"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "monthly, yearly",
    [(99000, 99000), (99000, 50000), (99000, 0), (99000, 99000 * 12 + 1), (0, 1000)],
    ids=["equal-to-monthly", "below-monthly", "zero", "above-12-months", "free-with-yearly"],
)
async def test_unreasonable_prices_are_rejected(client, admin, plan, monthly, yearly):
    payload = _plan_payload(name=plan.name, price=monthly, yearly=yearly)

    created = await client.post("/api/admin/subscriptions", json=payload, headers=admin.auth)
    updated = await client.put(f"/api/admin/subscriptions/{plan.id}", json=payload, headers=admin.auth)

    assert created.status_code == 422
    assert updated.status_code == 422
    assert "Giá năm" in created.json()["detail"] or "giá năm" in created.json()["detail"]
    row = _fetch("SELECT monthly, yearly FROM subscription_plans WHERE id = %s", plan.id)[0]
    assert row == {"monthly": MONTHLY, "yearly": YEARLY}


@pytest.mark.asyncio
async def test_yearly_price_is_required(client, admin):
    payload = _plan_payload()
    del payload["yearly"]

    r = await client.post("/api/admin/subscriptions", json=payload, headers=admin.auth)

    assert r.status_code == 422


@pytest.mark.asyncio
async def test_free_plan_is_allowed_with_zero_prices(client, admin):
    r = await client.post("/api/admin/subscriptions", json=_plan_payload(price=0, yearly=0), headers=admin.auth)
    assert r.status_code == 200, r.text
    _delete_plan(r.json()["plan"]["id"])


@pytest.mark.asyncio
async def test_only_admin_can_change_plans(client, buyer, plan):
    r = await client.put(f"/api/admin/subscriptions/{plan.id}", json=_plan_payload(), headers=buyer.auth)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_plan_with_orders_cannot_be_deleted(client, admin, buyer, plan):
    await _create_order(client, buyer, plan.slug)

    r = await client.delete(f"/api/admin/subscriptions/{plan.id}", headers=admin.auth)

    assert r.status_code == 409
    assert "tắt hiển thị" in r.json()["detail"]
    assert _fetch("SELECT id FROM subscription_plans WHERE id = %s", plan.id)


@pytest.mark.asyncio
async def test_plan_without_orders_can_be_deleted(client, admin):
    created = _create_plan()

    r = await client.delete(f"/api/admin/subscriptions/{created.id}", headers=admin.auth)

    assert r.status_code == 200, r.text
    assert not _fetch("SELECT id FROM subscription_plans WHERE id = %s", created.id)


@pytest.mark.asyncio
async def test_all_paid_plans_have_a_real_yearly_price(client):
    """Sau migration sub0000000004 không còn gói nào có giá năm bằng giá tháng."""
    plans = (await client.get("/api/subscriptions/plans")).json()["plans"]
    paid = [item for item in plans if item["monthly"] > 0]
    assert paid
    for item in paid:
        assert item["monthly"] < item["yearly"] <= item["monthly"] * 12, item["name"]


# ---------------------------------------------------------------------------
# 2. Tạo đơn
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize("cycle, expected", [("monthly", MONTHLY), ("yearly", YEARLY)])
async def test_order_amount_comes_from_the_plan_and_is_stored(client, payos, buyer, plan, cycle, expected):
    r = await _create_order(client, buyer, plan.slug, cycle)

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["amount"] == expected
    assert data["plan"] == {"id": plan.slug, "name": plan.name, "cycle": cycle, "monthly": MONTHLY, "yearly": YEARLY}
    assert payos.links[0]["amount"] == expected
    assert payos.links[0]["items"][0]["price"] == expected

    order = _order(data["orderCode"])
    assert order["user_id"] == buyer.id
    assert order["plan_id"] == plan.id
    assert order["cycle"] == cycle
    assert order["amount"] == expected
    assert order["status"] == "pending"
    assert order["payment_url"] == "https://pay.example.com/link"
    assert _subscriptions(buyer.id) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "requested, slug, key",
    [("vip", "100003", "vip"), ("VIP", "100003", "vip"), ("100003", "100003", "vip"), ("premium", "100002", "premium"), ("100002", "100002", "premium")],
)
async def test_default_plans_are_found_by_old_name_or_slug(client, buyer, requested, slug, key):
    row = _fetch("SELECT id, monthly, yearly FROM subscription_plans WHERE slug = %s", slug)[0]

    r = await _create_order(client, buyer, requested)

    assert r.status_code == 200, r.text
    assert r.json()["amount"] == row["yearly"]
    assert r.json()["plan"]["id"] == key
    assert _order(r.json()["orderCode"])["plan_id"] == row["id"]


@pytest.mark.asyncio
async def test_custom_plan_is_sold_at_its_own_price_not_as_premium(client, buyer):
    """Lỗi gốc: gói tự tạo bị bán thành Premium; mã gói tự tạo còn làm API lỗi 500 khi tên trùng."""
    custom = _create_plan(name=f"Premium Plus {uuid.uuid4().hex[:6]}", monthly=10000, yearly=80000)
    try:
        by_slug = await _create_order(client, buyer, custom.slug)
        by_alias = await _create_order(client, buyer, "premium")

        assert by_slug.status_code == 200, by_slug.text
        assert by_slug.json()["amount"] == 80000
        assert by_slug.json()["plan"]["name"] == custom.name

        premium = _fetch("SELECT yearly FROM subscription_plans WHERE slug = '100002'")[0]
        assert by_alias.status_code == 200, by_alias.text
        assert by_alias.json()["amount"] == premium["yearly"]
        assert by_alias.json()["plan"]["name"] == "Premium"
    finally:
        _delete_plan(custom.id)


@pytest.mark.asyncio
async def test_unknown_plan_is_rejected_instead_of_becoming_premium(client, payos, buyer):
    r = await _create_order(client, buyer, "khong-co-goi-nay")

    assert r.status_code == 404
    assert payos.links == []


@pytest.mark.asyncio
async def test_inactive_plan_is_not_sold(client, payos, buyer):
    hidden = _create_plan(active=False)
    try:
        r = await _create_order(client, buyer, hidden.slug)

        assert r.status_code == 404
        assert payos.links == []
    finally:
        _delete_plan(hidden.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("cycle", ["weekly", "YEARLY", ""])
async def test_unknown_cycle_is_rejected(client, payos, buyer, plan, cycle):
    r = await _create_order(client, buyer, plan.slug, cycle)

    assert r.status_code == 422
    assert payos.links == []


@pytest.mark.asyncio
async def test_free_plan_creates_no_order_or_payment_link(client, payos, buyer):
    r = await _create_order(client, buyer, "free")

    assert r.status_code == 200, r.text
    assert r.json()["amount"] == 0
    assert r.json()["status"] == "PAID"
    assert payos.links == []
    assert _fetch("SELECT id FROM payment_orders WHERE user_id = %s", buyer.id) == []


@pytest.mark.asyncio
async def test_create_order_requires_login(client, payos, plan):
    r = await client.post("/api/payment/create-order", json={"plan_id": plan.slug, "cycle": "yearly"})

    assert r.status_code == 401
    assert payos.links == []


@pytest.mark.asyncio
async def test_payment_links_return_to_the_site_that_created_them(client, payos, buyer, plan):
    r = await client.post(
        "/api/payment/create-order",
        json={
            "plan_id": plan.slug,
            "cycle": "yearly",
            "return_url": "https://defend-ai.example.com/payment-success",
            "cancel_url": "https://defend-ai.example.com/payment-cancel",
        },
        headers=buyer.auth,
    )

    code = r.json()["orderCode"]
    link = payos.links[0]
    assert link["return_url"].startswith("https://defend-ai.example.com/payment-success?")
    assert f"order_id={code}" in link["return_url"]
    assert "cycle=yearly" in link["return_url"]
    assert link["cancel_url"].startswith("https://defend-ai.example.com/payment-cancel?")


# ---------------------------------------------------------------------------
# 3. Xác nhận đơn
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pending_order_activates_nothing(client, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    r = await _status(client, buyer, code)

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PENDING"
    assert _subscriptions(buyer.id) == []
    assert _order(code)["status"] == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("cycle, days, amount", [("monthly", 30, MONTHLY), ("yearly", 365, YEARLY)])
async def test_paid_order_activates_exactly_what_was_ordered(client, payos, buyer, plan, cycle, days, amount):
    """Lỗi gốc: đơn chỉ lưu trong RAM nên backend restart thì khách trả gói năm lại nhận Premium tháng."""
    code = (await _create_order(client, buyer, plan.slug, cycle)).json()["orderCode"]
    payos.paid[code] = {"status": "PAID", "amount": amount}

    r = await _status(client, buyer, code)

    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PAID"
    assert r.json()["membership"]["plan"] == plan.slug
    assert r.json()["membership"]["cycle"] == cycle

    order = _order(code)
    assert order["status"] == "paid"
    assert order["paid_at"] is not None
    assert order["amount"] == amount

    subscriptions = _subscriptions(buyer.id)
    assert len(subscriptions) == 1
    assert subscriptions[0]["plan_id"] == plan.id
    assert subscriptions[0]["payment_order_id"] == order["id"]
    assert subscriptions[0]["expires_at"] - subscriptions[0]["starts_at"] == timedelta(days=days)


@pytest.mark.asyncio
async def test_price_change_after_ordering_does_not_change_the_order(client, payos, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]
    _execute("UPDATE subscription_plans SET monthly = 1000, yearly = 5000 WHERE id = %s", plan.id)
    payos.paid[code] = {"status": "PAID", "amount": YEARLY}

    r = await _status(client, buyer, code)

    assert r.json()["status"] == "PAID"
    assert _order(code)["amount"] == YEARLY


@pytest.mark.asyncio
async def test_vip_plan_is_stored_as_vip_membership(client, payos, buyer):
    vip = _create_plan(name=f"VIP Pytest {uuid.uuid4().hex[:6]}", monthly=199000, yearly=1990000)
    try:
        code = (await _create_order(client, buyer, vip.slug)).json()["orderCode"]
        payos.paid[code] = {"status": "PAID", "amount": 1990000}

        r = await _status(client, buyer, code)

        assert r.json()["membership"]["plan"] == "vip"
        me = await client.get("/api/auth/me", headers=buyer.auth)
        assert me.json()["profile_data"]["membership"]["plan"] == "vip"
        account = await client.get("/api/payment/account", headers=buyer.auth)
        assert account.json()["subscription"]["plan_name"] == vip.name
    finally:
        _delete_plan(vip.id)


@pytest.mark.asyncio
async def test_checking_a_paid_order_again_does_not_extend_the_plan(client, payos, buyer, plan):
    """Lỗi gốc: gọi lại order-status của đơn cũ sẽ gia hạn gói miễn phí."""
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]
    payos.paid[code] = {"status": "PAID", "amount": YEARLY}
    await _status(client, buyer, code)

    soon = datetime.utcnow() + timedelta(days=1)
    _execute("UPDATE subscriptions SET expires_at = %s WHERE user_id = %s", soon, buyer.id)
    r = await _status(client, buyer, code)

    assert r.json()["status"] == "PAID"
    subscriptions = _subscriptions(buyer.id)
    assert len(subscriptions) == 1
    assert subscriptions[0]["expires_at"] == soon


@pytest.mark.asyncio
async def test_concurrent_checks_activate_only_once(client, payos, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]
    payos.paid[code] = {"status": "PAID", "amount": YEARLY}

    responses = await asyncio.gather(*(_status(client, buyer, code) for _ in range(6)))

    assert {r.json()["status"] for r in responses} == {"PAID"}
    assert len(_subscriptions(buyer.id)) == 1


@pytest.mark.asyncio
async def test_other_user_cannot_activate_or_see_an_order(client, payos, buyer, other_user, plan):
    """Lỗi gốc: tài khoản khác gọi với mã đơn đã trả cũng được kích hoạt gói."""
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]
    payos.paid[code] = {"status": "PAID", "amount": YEARLY}

    r = await _status(client, other_user, code)

    assert r.status_code == 404
    assert _subscriptions(other_user.id) == []
    assert _subscriptions(buyer.id) == []
    assert _order(code)["status"] == "pending"


@pytest.mark.asyncio
async def test_order_status_requires_login(client, plan, buyer):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    r = await client.get(f"/api/payment/order-status/{code}")

    assert r.status_code == 401


@pytest.mark.asyncio
async def test_unknown_order_is_not_found(client, buyer):
    r = await _status(client, buyer, 999999999)

    assert r.status_code == 404


@pytest.mark.asyncio
async def test_payos_amount_mismatch_does_not_activate(client, payos, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]
    payos.paid[code] = {"status": "PAID", "amount": 1000}

    r = await _status(client, buyer, code)

    assert r.json()["status"] == "PENDING"
    assert _subscriptions(buyer.id) == []
    assert _order(code)["status"] == "pending"


@pytest.mark.asyncio
@pytest.mark.parametrize("payos_status", ["CANCELLED", "EXPIRED"])
async def test_cancelled_or_expired_links_are_reported(client, payos, buyer, plan, payos_status):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]
    payos.paid[code] = {"status": payos_status, "amount": YEARLY}

    r = await _status(client, buyer, code)

    assert r.json()["status"] == payos_status
    assert _subscriptions(buyer.id) == []


# ---------------------------------------------------------------------------
# 4. Webhook PayOS và xác nhận Sandbox
# ---------------------------------------------------------------------------

async def _webhook(client, code: int, amount: int, signature: str = "valid", status_code: str = "00"):
    return await client.post(
        "/api/payment/webhook",
        json={"code": status_code, "desc": "x", "data": {"orderCode": code, "amount": amount}, "signature": signature},
    )


@pytest.mark.asyncio
async def test_webhook_activates_the_ordered_plan_only_once(client, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    first = await _webhook(client, code, YEARLY)
    second = await _webhook(client, code, YEARLY)

    assert first.json()["success"] is True
    assert second.json()["success"] is True
    subscriptions = _subscriptions(buyer.id)
    assert len(subscriptions) == 1
    assert subscriptions[0]["plan_id"] == plan.id
    assert subscriptions[0]["expires_at"] - subscriptions[0]["starts_at"] == timedelta(days=365)
    assert _order(code)["status"] == "paid"


@pytest.mark.asyncio
async def test_webhook_with_wrong_amount_does_not_activate(client, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    r = await _webhook(client, code, MONTHLY)

    assert r.json()["success"] is False
    assert _subscriptions(buyer.id) == []
    assert _order(code)["status"] == "pending"


@pytest.mark.asyncio
async def test_webhook_with_bad_signature_is_rejected(client, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    r = await _webhook(client, code, YEARLY, signature="forged")

    assert r.status_code == 400
    assert _subscriptions(buyer.id) == []


@pytest.mark.asyncio
async def test_webhook_for_failed_payment_is_ignored(client, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    r = await _webhook(client, code, YEARLY, status_code="01")

    assert r.status_code == 200
    assert _subscriptions(buyer.id) == []


@pytest.mark.asyncio
async def test_webhook_for_unknown_order_is_acknowledged(client):
    r = await _webhook(client, 999999999, YEARLY)

    assert r.status_code == 200
    assert r.json()["success"] is True


@pytest.mark.asyncio
async def test_webhook_is_refused_when_payos_is_not_configured(client, monkeypatch, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]
    monkeypatch.setattr(payos_service, "is_configured", lambda: False)

    r = await _webhook(client, code, YEARLY)

    assert r.status_code == 503
    assert _subscriptions(buyer.id) == []


@pytest.mark.asyncio
async def test_sandbox_confirm_activates_own_order_with_its_plan_and_cycle(client, buyer, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    r = await client.post(f"/api/payment/mock-confirm/{code}", headers=buyer.auth)

    assert r.status_code == 200, r.text
    assert r.json()["membership"]["plan"] == plan.slug
    assert r.json()["membership"]["cycle"] == "yearly"
    assert _order(code)["status"] == "paid"
    assert _order(code)["amount"] == YEARLY


@pytest.mark.asyncio
async def test_sandbox_confirm_rejects_other_users_and_unknown_orders(client, buyer, other_user, plan):
    code = (await _create_order(client, buyer, plan.slug)).json()["orderCode"]

    other = await client.post(f"/api/payment/mock-confirm/{code}", headers=other_user.auth)
    unknown = await client.post("/api/payment/mock-confirm/999999999", headers=buyer.auth)
    anonymous = await client.post(f"/api/payment/mock-confirm/{code}")

    assert other.status_code == 404
    assert unknown.status_code == 404
    assert anonymous.status_code == 401
    assert _subscriptions(other_user.id) == []
    assert _subscriptions(buyer.id) == []


# ---------------------------------------------------------------------------
# 5. Mua tiếp khi đang có gói
# ---------------------------------------------------------------------------

async def _pay(client, payos, user, plan_id: str, cycle: str) -> int:
    created = (await _create_order(client, user, plan_id, cycle)).json()
    payos.paid[created["orderCode"]] = {"status": "PAID", "amount": created["amount"]}
    r = await _status(client, user, created["orderCode"])
    assert r.json()["status"] == "PAID", r.text
    return created["orderCode"]


def _active_subscriptions(user_id: int) -> list[dict]:
    return [row for row in _subscriptions(user_id) if row["status"] == "active"]


@pytest.mark.asyncio
@pytest.mark.parametrize("cycle", ["monthly", "yearly"])
async def test_account_reports_the_cycle_of_the_current_plan(client, payos, buyer, plan, cycle):
    await _pay(client, payos, buyer, plan.slug, cycle)

    subscription = (await client.get("/api/payment/account", headers=buyer.auth)).json()["subscription"]

    assert subscription["plan_id"] == plan.slug
    assert subscription["cycle"] == cycle


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "first, second, days",
    [("monthly", "yearly", 365), ("monthly", "monthly", 30), ("yearly", "yearly", 365), ("yearly", "monthly", 30)],
)
async def test_buying_the_same_plan_keeps_the_days_already_paid(client, payos, buyer, plan, first, second, days):
    """Lỗi gốc: chuyển từ tháng sang năm làm mất số ngày còn lại của gói tháng đã trả tiền."""
    await _pay(client, payos, buyer, plan.slug, first)
    remaining = datetime.utcnow() + timedelta(days=10)
    _execute("UPDATE subscriptions SET expires_at = %s WHERE user_id = %s", remaining, buyer.id)

    code = await _pay(client, payos, buyer, plan.slug, second)

    expected = remaining + timedelta(days=days)
    active = _active_subscriptions(buyer.id)
    assert len(active) == 1
    assert active[0]["payment_order_id"] == _order(code)["id"]
    assert active[0]["expires_at"] == expected

    membership = (await client.get("/api/auth/me", headers=buyer.auth)).json()["profile_data"]["membership"]
    assert membership["cycle"] == second
    assert membership["expires_at"] == expected.isoformat()

    subscription = (await client.get("/api/payment/account", headers=buyer.auth)).json()["subscription"]
    assert subscription["cycle"] == second
    assert subscription["expires_at"] == expected.isoformat()


@pytest.mark.asyncio
async def test_expired_plan_adds_no_extra_time(client, payos, buyer, plan):
    await _pay(client, payos, buyer, plan.slug, "monthly")
    _execute("UPDATE subscriptions SET expires_at = %s WHERE user_id = %s", datetime.utcnow() - timedelta(days=3), buyer.id)

    await _pay(client, payos, buyer, plan.slug, "yearly")

    active = _active_subscriptions(buyer.id)
    assert len(active) == 1
    assert active[0]["expires_at"] - active[0]["starts_at"] == timedelta(days=365)


@pytest.mark.asyncio
async def test_switching_to_another_plan_starts_from_payment_time(client, payos, buyer, plan):
    """Thời gian của gói cũ không được đổi 1:1 sang gói khác, nếu không Premium sẽ thành VIP miễn phí."""
    other = _create_plan()
    try:
        await _pay(client, payos, buyer, plan.slug, "yearly")

        await _pay(client, payos, buyer, other.slug, "monthly")

        active = _active_subscriptions(buyer.id)
        assert len(active) == 1
        assert active[0]["plan_id"] == other.id
        assert active[0]["expires_at"] - active[0]["starts_at"] == timedelta(days=30)
    finally:
        _delete_plan(other.id)


@pytest.mark.asyncio
async def test_two_orders_paid_at_the_same_time_both_count(client, payos, buyer, plan):
    monthly = (await _create_order(client, buyer, plan.slug, "monthly")).json()
    yearly = (await _create_order(client, buyer, plan.slug, "yearly")).json()
    payos.paid[monthly["orderCode"]] = {"status": "PAID", "amount": MONTHLY}
    payos.paid[yearly["orderCode"]] = {"status": "PAID", "amount": YEARLY}

    responses = await asyncio.gather(
        _status(client, buyer, monthly["orderCode"]),
        _status(client, buyer, yearly["orderCode"]),
    )

    assert [r.json()["status"] for r in responses] == ["PAID", "PAID"]
    active = _active_subscriptions(buyer.id)
    assert len(active) == 1
    assert abs(active[0]["expires_at"] - (datetime.utcnow() + timedelta(days=395))) < timedelta(minutes=1)
