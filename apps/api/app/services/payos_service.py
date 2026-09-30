"""
PayOS & MoMo / VietQR Service for handling payment requests and QR code generation.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import urllib.parse
from typing import Any, Dict, Optional
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

PAYOS_API_BASE = "https://api-merchant.payos.vn"


class PayOSService:
    def __init__(self):
        pass

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
    def momo_phone(self) -> str:
        return settings.payos.momo_phone if settings.payos else ""

    @property
    def momo_name(self) -> str:
        return settings.payos.momo_name if settings.payos else ""

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

    def generate_signature(self, data: Dict[str, Any]) -> str:
        """
        Creates HMAC SHA256 signature for PayOS request payload.
        Keys sorted alphabetically, formatted as key=value&key2=value2
        """
        sorted_keys = sorted(data.keys())
        sign_string = "&".join(f"{k}={data[k]}" for k in sorted_keys if data[k] is not None)
        return hmac.new(
            self.checksum_key.encode("utf-8"),
            sign_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

    def verify_webhook_signature(self, webhook_data: Dict[str, Any], signature: str) -> bool:
        """
        Verifies the signature of a webhook notification from PayOS.
        """
        if not self.checksum_key:
            return True
        sorted_keys = sorted(webhook_data.keys())
        sign_string = "&".join(f"{k}={webhook_data[k]}" for k in sorted_keys if k != "signature" and webhook_data[k] is not None)
        expected_sig = hmac.new(
            self.checksum_key.encode("utf-8"),
            sign_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected_sig, signature)

    async def create_payment_link(
        self,
        order_code: int,
        amount: int,
        description: str,
        return_url: str,
        cancel_url: str,
        method: str = "payos",
        items: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Creates a payment link via PayOS or returns a dynamic VietQR / MoMo payment payload.
        """
        clean_desc = description[:25].strip()

        # 1. If PayOS API keys are configured and method is payos, call PayOS official API
        if self.is_configured() and method != "momo":
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
                        return {
                            "success": True,
                            "orderCode": order_code,
                            "amount": amount,
                            "description": clean_desc,
                            "checkoutUrl": res_data.get("checkoutUrl"),
                            "qrCode": res_data.get("qrCode"),
                            "qrImageUrl": f"https://api.vietqr.io/image/970422-{res_data.get('accountNumber')}-compact2.jpg?amount={amount}&addInfo={clean_desc}&accountName={res_data.get('accountName')}",
                            "accountName": res_data.get("accountName"),
                            "accountNumber": res_data.get("accountNumber"),
                            "bin": res_data.get("bin"),
                            "status": "PENDING",
                            "isSandbox": False
                        }
                    else:
                        logger.warning("PayOS API returned error: %s. Falling back to customized QR mode.", data)
            except Exception as exc:
                logger.error("Error communicating with PayOS: %s", exc)

        # 2. Custom MoMo QR (Personal wallet MoMo)
        if method == "momo" or (self.momo_phone and method in ("momo", "payos")):
            momo_num = self.momo_phone or "0339888999"
            momo_user = self.momo_name or "DEFENDAI EDUCATION"
            
            # Standard MoMo Transfer QR Data
            # Format: 2|99|<phone>|<name>|<email>|0|0|<amount>|<message>|transfer_myqr
            momo_raw_qr = f"2|99|{momo_num}|{momo_user}||0|0|{amount}|{clean_desc}|transfer_myqr"
            encoded_momo = urllib.parse.quote(momo_raw_qr)
            qr_image_url = f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={encoded_momo}"

            return {
                "success": True,
                "orderCode": order_code,
                "amount": amount,
                "description": clean_desc,
                "checkoutUrl": f"https://me.momo.vn/{momo_num}",
                "qrCode": momo_raw_qr,
                "qrImageUrl": qr_image_url,
                "accountName": momo_user,
                "accountNumber": momo_num,
                "bin": "MOMO",
                "status": "PENDING",
                "isSandbox": not bool(self.momo_phone or self.is_configured())
            }

        # 3. Custom Bank / VietQR
        acc_no = self.bank_account or "0339888999"
        acc_bin = self.bank_bin or "970422"  # MBBank
        acc_name = self.bank_account_name or "DEFENDAI EDUCATION"

        qr_image_url = f"https://img.vietqr.io/image/{acc_bin}-{acc_no}-compact2.png?amount={amount}&addInfo={clean_desc}&accountName={urllib.parse.quote(acc_name)}"

        return {
            "success": True,
            "orderCode": order_code,
            "amount": amount,
            "description": clean_desc,
            "checkoutUrl": f"/checkout?orderCode={order_code}",
            "qrCode": f"00020101021238540010A00000072701240006{acc_bin}0110{acc_no}0208QRIBFTTA5303704540{len(str(amount)):02d}{amount}5802VN62{len(clean_desc)+4:02d}080{len(clean_desc):02d}{clean_desc}6304",
            "qrImageUrl": qr_image_url,
            "accountName": acc_name,
            "accountNumber": acc_no,
            "bin": acc_bin,
            "status": "PENDING",
            "isSandbox": not bool(self.bank_account or self.is_configured())
        }

    async def get_payment_link_information(self, order_code: int) -> Dict[str, Any]:
        """
        Retrieves status of a PayOS payment request.
        """
        if self.is_configured():
            try:
                headers = {
                    "x-client-id": self.client_id,
                    "x-api-key": self.api_key,
                    "Content-Type": "application/json"
                }
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.get(
                        f"{PAYOS_API_BASE}/v2/payment-requests/{order_code}",
                        headers=headers
                    )
                    data = res.json()
                    if res.status_code == 200 and data.get("code") == "00":
                        return data.get("data", {})
            except Exception as exc:
                logger.error("Error fetching PayOS order status for %s: %s", order_code, exc)
        return {}


payos_service = PayOSService()
