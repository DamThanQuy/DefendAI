"""Đơn vị đếm token — tiktoken (cl100k_base), fallback len/4 nếu không có package.

Lazy-load: chỉ import tiktoken khi gọi lần đầu (tránh phí khởi động + cho phép
chạy offline — nếu tiktoken thiếu hoặc không tải được vocab thì dùng heuristic).
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_enc = None
_enc_error: str | None = None


def _get_encoding():
    global _enc, _enc_error
    if _enc is None and _enc_error is None:
        try:
            import tiktoken

            _enc = tiktoken.get_encoding("cl100k_base")
        except Exception as exc:  # noqa: BLE001 — offline / thiếu package
            _enc_error = str(exc)
            logger.warning("tiktoken unavailable, fallback len/4: %s", exc)
    return _enc


def count_tokens(text: str) -> int:
    """Đếm token chính xác (tiktoken). Không có tiktoken → ước lượng len/4."""
    if not text:
        return 0
    enc = _get_encoding()
    if enc is not None:
        try:
            return len(enc.encode(text))
        except Exception:  # noqa: BLE001
            pass
    return max(1, (len(text) + 3) // 4)