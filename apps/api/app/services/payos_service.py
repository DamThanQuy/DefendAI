"""Create and verify PayOS payment links."""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any, Dict, Optional
import urllib.parse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PAYOS_API_BASE = "https://api-merchant.payos.vn"


class PayOSUnavailableError(Exception):
    """The payment channel is not configured."""


class PayOSRequestError(Exception):
    """PayOS did not return a usable payment response."""


def _signature_value(value: Any) -> str:
    if value is None or value in ("null", "undefined"):
        return ""
    if isinstance(value, list):
        sorted_items = [dict(sorted(item.items())) if isinstance(item, dict) else item for item in value]
        return json.dumps(sorted_items, separators=(",", ":"), ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


class PayOSService:
    @property
    def client_id(self) -> str:
        return settings.payos.client_id if settings.payos else ""

    @property
    def api_key(self) -> str:
        return settings.payos.api_key if settings.payos else ""

    @property
    def checksum_key(self) -> str:
        return settings.payos.checksum_key if settings.payos else ""

    @property
    def bank_bin(self) -> str:
        return (settings.payos.bank_bin if settings.payos and settings.payos.bank_bin else "970422")

    @property
    def bank_account(self) -> str:
        return settings.payos.bank_account if settings.payos else ""

    @property
    def bank_account_name(self) -> str:
        return settings.payos.bank_account_name if settings.payos else ""

    def is_configured(self) -> bool:
        return bool(self.client_id and self.api_key and self.checksum_key)

    def is_sandbox_enabled(self) -> bool:
        return bool(settings.payos and settings.payos.sandbox_enabled) and not any(
            (self.client_id, self.api_key, self.checksum_key)
        )

    def generate_signature(self, data: dict[str, Any]) -> str:
        sign_string = "&".join(f"{key}={_signature_value(value)}" for key, value in sorted(data.items()))
        return hmac.new(self.checksum_key.encode("utf-8"), sign_string.encode("utf-8"), hashlib.sha256).hexdigest()

    def verify_signature(self, data: dict[str, Any], signature: Any) -> bool:
        if not self.checksum_key or not isinstance(signature, str) or not signature.isascii():
            return False
        return hmac.compare_digest(self.generate_signature(data), signature)

    async def create_payment_link(
        self,
        order_code: int,
        amount: int,
        description: str,
        return_url: str,
        cancel_url: str,
        items: Optional[list] = None,
        method: Optional[str] = None,
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        Creates a payment link via PayOS and returns the official VietQR code payload.
        """
        clean_desc = description[:25].strip()

        # 1. If PayOS API keys are configured, call PayOS official API
        if self.is_configured():
            try:
                payload = {
                    "orderCode": order_code,
                    "amount": amount,
                    "description": clean_desc,
                    "returnUrl": return_url,
                    "cancelUrl": cancel_url,
                }
                signature = self.generate_signature(payload)

                request_body = {
                    **payload,
                    "signature": signature,
                    "items": items or [{"name": clean_desc, "quantity": 1, "price": amount}]
                }

                headers = {
                    "x-client-id": self.client_id,
                    "x-api-key": self.api_key,
                    "Content-Type": "application/json"
                }

                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{PAYOS_API_BASE}/v2/payment-requests",
                        json=request_body,
                        headers=headers
                    )
                    data = res.json()
                    if res.status_code == 200 and data.get("code") == "00":
                        res_data = data.get("data", {})
                        raw_qr = res_data.get("qrCode", "")
                        
                        # Render QR code image directly from the official EMVCo VietQR string
                        qr_image_url = f"https://api.qrserver.com/v1/create-qr-code/?size=350x350&data={urllib.parse.quote(raw_qr)}"

                        return {
                            "success": True,
                            "orderCode": order_code,
                            "amount": amount,
                            "description": clean_desc,
                            "checkoutUrl": res_data.get("checkoutUrl"),
                            "qrCode": raw_qr,
                            "qrImageUrl": qr_image_url,
                            "accountName": res_data.get("accountName", "NGUYEN THE BAO"),
                            "accountNumber": res_data.get("accountNumber"),
                            "bin": res_data.get("bin", "970422"),
                            "paymentLinkId": res_data.get("paymentLinkId"),
                            "status": "PENDING",
                            "isSandbox": False
                        }
                    else:
                        logger.warning("PayOS API returned error: %s", data)
            except Exception as exc:
                logger.error("Error communicating with PayOS: %s", exc)

        # 2. Fallback direct bank transfer (VietQR)
        acc_no = self.bank_account or "040060104"
        acc_bin = self.bank_bin or "970422"  # MBBank
        acc_name = self.bank_account_name or "NGUYEN THE BAO"

        qr_image_url = f"https://img.vietqr.io/image/{acc_bin}-{acc_no}-compact2.png?amount={amount}&addInfo={clean_desc}&accountName={urllib.parse.quote(acc_name)}"

        return {
            "success": True,
            "orderCode": order_code,
            "amount": amount,
            "description": clean_desc,
            "checkoutUrl": f"/checkout?orderCode={order_code}",
            "qrCode": "",
            "qrImageUrl": qr_image_url,
            "accountName": acc_name,
            "accountNumber": acc_no,
            "bin": acc_bin,
            "status": "PENDING",
            "isSandbox": not self.is_configured()
        }

    async def get_payment_link_information(self, order_code: int) -> dict[str, Any]:
        if not self.is_configured():
            raise PayOSUnavailableError

        headers = {"x-client-id": self.client_id, "x-api-key": self.api_key}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.get(f"{PAYOS_API_BASE}/v2/payment-requests/{order_code}", headers=headers)
            result = response.json()
        except (httpx.RequestError, ValueError) as error:
            logger.warning("PayOS status check failed for order %s (%s)", order_code, type(error).__name__)
            raise PayOSRequestError from error

        if not isinstance(result, dict) or not response.is_success or result.get("code") != "00":
            code = result.get("code") if isinstance(result, dict) else None
            logger.warning("PayOS status check failed for order %s (HTTP %s, code %s)", order_code, response.status_code, code)
            raise PayOSRequestError

        data = result.get("data")
        if not isinstance(data, dict) or not self.verify_signature(data, result.get("signature")):
            logger.warning("PayOS returned an invalid status response signature for order %s", order_code)
            raise PayOSRequestError
        return data


payos_service = PayOSService()
