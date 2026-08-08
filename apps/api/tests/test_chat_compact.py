"""Test cửa sổ token (plan 3b): compact mức 1 (cắt bớt) + mức 2 (AI tóm tắt, mock gateway)."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from app.handlers import chat_ask
from app.handlers.chat_ask import _compact_history, _summarize_old_turns  # noqa: E402


def _turn(q: str, a: str) -> dict:
    return {"question": q, "answer": a}


def test_under_budget_keeps_all():
    h = [_turn("q1", "a1"), _turn("q2", "a2")]
    assert _compact_history(h, 1_000_000) == h


def test_over_budget_drops_oldest_keeps_latest():
    h = [_turn("q1", "a1"), _turn("q2", "a2"), _turn("q3", "a3")]
    out = _compact_history(h, 1)  # budget 1 token → chỉ giữ 1 lượt gần nhất
    assert len(out) == 1
    assert out[0]["question"] == "q3"


def test_never_empty():
    h = [_turn("q1", "a1")]
    assert _compact_history(h, 0) == h  # budget 0 vẫn giữ lượt duy nhất


# ── Compact mức 2: AI tóm tắt phần cũ ──────────────────────────────────────

class _FakeSummary:
    """Giả ai_gateway.generate — trả summary cố định, đếm số lần gọi."""

    def __init__(self, content: str = "Tóm tắt: chủ đề chính là X."):
        self.content = content
        self.calls = 0

    async def generate(self, **kwargs):
        self.calls += 1
        return {"content": self.content, "provider": "fake", "model": "fake"}


def test_summarize_under_budget_no_call(monkeypatch):
    fake = _FakeSummary()
    monkeypatch.setattr(chat_ask.ai_gateway, "generate", fake.generate)
    h = [_turn("q1", "a1"), _turn("q2", "a2")]
    out = asyncio.run(_summarize_old_turns(h, 1_000_000))
    assert out is None  # chưa vượt budget → không tóm tắt
    assert fake.calls == 0


def test_summarize_over_budget_keeps_latest(monkeypatch):
    fake = _FakeSummary("Tóm tắt: đã chốt kiến trúc microservices.")
    monkeypatch.setattr(chat_ask.ai_gateway, "generate", fake.generate)
    h = [_turn("q1", "a1"), _turn("q2", "a2"), _turn("q3", "a3")]
    out = asyncio.run(_summarize_old_turns(h, 1))
    assert out is not None
    assert fake.calls == 1
    # Lượt gần nhất giữ nguyên vẹn
    assert out[-1]["question"] == "q3"
    # Phần cũ thay bằng 1 bản tóm tắt
    assert out[0]["question"] == "[Tóm tắt hội thoại trước]"
    assert "microservices" in out[0]["answer"]


def test_summarize_ai_failure_falls_back(monkeypatch):
    async def boom(**kwargs):
        raise RuntimeError("AI down")

    monkeypatch.setattr(chat_ask.ai_gateway, "generate", boom)
    h = [_turn("q1", "a1"), _turn("q2", "a2"), _turn("q3", "a3")]
    out = asyncio.run(_summarize_old_turns(h, 1))
    assert out is None  # AI lỗi → caller fallback mức 1 (cắt bớt)


if __name__ == "__main__":
    test_under_budget_keeps_all()
    test_over_budget_drops_oldest_keeps_latest()
    test_never_empty()
    # Mức 2 — mock thủ công (không có monkeypatch khi chạy trực tiếp)
    fake = _FakeSummary()
    chat_ask.ai_gateway.generate = fake.generate
    h = [_turn("q1", "a1"), _turn("q2", "a2")]
    assert asyncio.run(_summarize_old_turns(h, 1_000_000)) is None
    assert fake.calls == 0
    fake2 = _FakeSummary("Tóm tắt: đã chốt kiến trúc microservices.")
    chat_ask.ai_gateway.generate = fake2.generate
    h2 = [_turn("q1", "a1"), _turn("q2", "a2"), _turn("q3", "a3")]
    out = asyncio.run(_summarize_old_turns(h2, 1))
    assert out is not None and out[-1]["question"] == "q3"
    assert "microservices" in out[0]["answer"]
    print("compact tests OK")