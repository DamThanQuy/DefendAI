"""PayOS protocol checks with a fake HTTP transport and no bank or database."""

import hashlib
import hmac
import json
import os
import sys

import httpx
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import PayOSConfig, settings  # noqa: E402
from app.services.payos_service import PayOSRequestError, PayOSService, PayOSUnavailableError  # noqa: E402


ORDER_CODE = 123456789
AMOUNT = 199000
DESCRIPTION = f"DEFEND {ORDER_CODE}"
PAYMENT = {
    "orderCode": ORDER_CODE,
    "amount": AMOUNT,
    "description": DESCRIPTION,
    "checkoutUrl": "https://pay.example.com/checkout",
    "qrCode": "provider&QR",
    "accountName": "Merchant",
    "accountNumber": "123456",
    "paymentLinkId": "provider-link",
}


@pytest.fixture
def payos(monkeypatch):
    monkeypatch.setattr(settings, "payos", PayOSConfig(client_id="test", api_key="test", checksum_key="test"))
    return PayOSService()


def _mock_transport(monkeypatch, handler):
    client_class = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda **kwargs: client_class(transport=httpx.MockTransport(handler), **kwargs)
    )


@pytest.mark.asyncio
async def test_create_link_preserves_existing_payment_details(payos, monkeypatch):
    def respond(request):
        assert request.method == "POST" and request.url.path == "/v2/payment-requests"
        request_data = json.loads(request.content)
        assert request_data["description"] == DESCRIPTION
        signature = request_data.pop("signature")
        del request_data["items"]
        assert payos.verify_signature(request_data, signature)
        return httpx.Response(200, json={"code": "00", "data": PAYMENT, "signature": payos.generate_signature(PAYMENT)})

    _mock_transport(monkeypatch, respond)
    result = await payos.create_payment_link(
        ORDER_CODE, AMOUNT, DESCRIPTION, "https://example.com/success", "https://example.com/cancel", method="momo"
    )
    assert result["qrCode"] == PAYMENT["qrCode"]
    assert "data=provider%26QR" in result["qrImageUrl"]
    assert result["paymentLinkId"] == PAYMENT["paymentLinkId"]
    assert result["isSandbox"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["api_error", "network"])
async def test_create_link_preserves_bank_transfer_on_payos_error(payos, monkeypatch, failure):
    def respond(request):
        if failure == "network":
            raise httpx.ConnectError("offline", request=request)
        return httpx.Response(200, json={"code": "01", "desc": "Rejected"})

    _mock_transport(monkeypatch, respond)
    result = await payos.create_payment_link(
        ORDER_CODE, AMOUNT, DESCRIPTION, "https://example.com/success", "https://example.com/cancel"
    )
    assert result["checkoutUrl"] == f"/checkout?orderCode={ORDER_CODE}"
    assert result["qrImageUrl"] and result["isSandbox"] is False
    assert "paymentLinkId" not in result


@pytest.mark.asyncio
async def test_status_accepts_signature_with_optional_values_and_transactions(payos, monkeypatch):
    payload = {
        "amountPaid": AMOUNT,
        "orderCode": ORDER_CODE,
        "status": "PAID",
        "transactions": [{"reference": "bank", "amount": AMOUNT, "account": None}],
        "cancellationReason": None,
    }
    signed_message = (
        f"amountPaid={AMOUNT}&cancellationReason=&orderCode={ORDER_CODE}"
        f'&status=PAID&transactions=[{{"account":null,"amount":{AMOUNT},"reference":"bank"}}]'
    )
    signature = hmac.new(b"test", signed_message.encode(), hashlib.sha256).hexdigest()

    def respond(request):
        assert request.method == "GET" and request.url.path == f"/v2/payment-requests/{ORDER_CODE}"
        return httpx.Response(200, json={"code": "00", "data": payload, "signature": signature})

    _mock_transport(monkeypatch, respond)
    assert await payos.get_payment_link_information(ORDER_CODE) == payload


@pytest.mark.asyncio
async def test_status_rejects_unverified_provider_response(payos, monkeypatch):
    def respond(request):
        return httpx.Response(200, json={"code": "00", "data": {"status": "PAID"}, "signature": "invalid"})

    _mock_transport(monkeypatch, respond)
    with pytest.raises(PayOSRequestError):
        await payos.get_payment_link_information(ORDER_CODE)


@pytest.mark.asyncio
async def test_unconfigured_gateway_preserves_bank_transfer_and_requires_demo_opt_in(monkeypatch):
    monkeypatch.setattr(
        settings, "payos", PayOSConfig(client_id="", api_key="", checksum_key="", sandbox_enabled=False)
    )
    payos = PayOSService()
    assert not payos.is_sandbox_enabled()
    assert not payos.verify_signature({}, "invalid")
    result = await payos.create_payment_link(
        ORDER_CODE, AMOUNT, DESCRIPTION, "https://example.com/success", "https://example.com/cancel"
    )
    assert result["checkoutUrl"] == f"/checkout?orderCode={ORDER_CODE}"
    assert result["qrImageUrl"] and result["isSandbox"] is True
    with pytest.raises(PayOSUnavailableError):
        await payos.get_payment_link_information(ORDER_CODE)
    settings.payos.sandbox_enabled = True
    assert payos.is_sandbox_enabled()
    settings.payos.client_id = "partly-configured"
    assert not payos.is_sandbox_enabled()
