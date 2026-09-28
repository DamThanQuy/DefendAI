"""EvidenceSynthesizer — Step 4 (A1) bounded-prompt AI review.

After Step 3 has produced a ``RequirementMatch`` row with a deterministic
``status`` and ``confidence``, the worker can optionally ask the AI to:

  - explain the match in 1-2 sentences (``reason``)
  - enumerate what is still missing (``missing_evidence``)
  - optionally refine ``confidence`` when the LLM has more context than
    the heuristic.

The synthesizer:

- Sends **bounded** input: the requirement text + the top-3 evidence rows
  already filtered by Step 3 (path, symbol, snippet ≤ 8KB total).
- Masks secrets inside snippets before sending to any provider.
- Validates the response against a strict JSON schema; falls back to the
  heuristic result when parsing fails or the AI provider is unreachable.
- Never calls a provider directly — always via ``AIGateway``.

Public API:

    synthesize_match_explanation(
        requirement: RequirementItem,
        top_evidence: list[dict],
        heuristic_status: str,
        heuristic_confidence: int,
        heuristic_missing: list[str],
    ) -> SynthesizerResult
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from app.services.ai_client import ai_gateway
from app.services.requirement_extractor import RequirementItem

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------
MAX_EVIDENCE_ROWS = 3
MAX_SNIPPET_CHARS = 2_500  # ~ 2.5KB per snippet
MAX_TOTAL_PROMPT_CHARS = 8_000  # matches plan §A1 (max 8KB)
ALLOWED_STATUSES = {"matched", "partial", "not_found", "insufficient_evidence"}
LLM_TIMEOUT_SECONDS = 30
LLM_RETRY_ATTEMPTS = 2

# JSON-fence cleanup (LLaMA / Gemini like to wrap answers in ```json ... ```)
_JSON_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\}|\s*\{.*\})\s*```", re.DOTALL)


# ---------------------------------------------------------------------------
# Secret masking
# ---------------------------------------------------------------------------
_SECRET_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)(api[_-]?key|secret|password|passwd|token|access[_-]?key)\s*[:=]\s*['\"]?([A-Za-z0-9._\-]+)['\"]?"),
    re.compile(r"(?i)(bearer)\s+[A-Za-z0-9._\-]+"),
    re.compile(r"-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----"),
    re.compile(r"\b(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_\-]{20,})\b"),
    re.compile(r"(?i)(aws_secret_access_key|aws_access_key_id)\s*=\s*\S+"),
)


def mask_secrets(text: str) -> str:
    """Replace secret-looking patterns with ``[REDACTED]`` before sending to AI."""
    if not text:
        return text
    out = text
    for pattern in _SECRET_PATTERNS:
        out = pattern.sub(lambda m: m.group(0).replace(m.group(m.lastindex or 0), "[REDACTED]") if m.lastindex else "[REDACTED]", out)
    return out


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "Bạn là trợ lý kỹ thuật phân tích bằng chứng triển khai (evidence review) cho hệ thống DefendAI.\n"
    "Nhiệm vụ: đánh giá mức độ source code đáp ứng một yêu cầu (requirement) đã được lọc sẵn bởi heuristic.\n\n"
    "QUAN TRỌNG:\n"
    "  - Chỉ trả về JSON hợp lệ, không giải thích thêm, không bọc ```json.\n"
    '  - Schema bắt buộc: {"status": "matched|partial|not_found|insufficient_evidence",\n'
    '                       "confidence": <int 0-100>,\n'
    '                       "reason": "<giải thích ngắn 1-3 câu, tiếng Việt>",\n'
    '                       "missing_evidence": ["<keyword1>", "<keyword2>"]}\n'
    "  - status: dùng đúng một trong 4 giá trị trên; nếu evidence không đủ hãy dùng "
    "'insufficient_evidence' thay vì 'not_found'.\n"
    "  - confidence: số nguyên 0-100. Nếu không chắc chắn, hãy giữ giá trị gần với heuristic.\n"
    "  - reason: tối đa 400 ký tự, dẫn chứng cụ thể (path / symbol / route) nếu có.\n"
    "  - missing_evidence: tối đa 5 keyword ngắn gọn mô tả cái còn thiếu (ví dụ: "
    '"validate_size", "permission check", "audit log").\n'
    "  - KHÔNG suy đoán ngoài evidence đã cung cấp. Nếu evidence rỗng/nghèo → status = insufficient_evidence."
)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class SynthesizerResult:
    """Outcome of one synthesize call.

    All fields are populated even when the AI is unavailable — the worker can
    persist a safe fallback without branching.
    """

    status: str
    confidence: int
    reason: str
    missing_evidence: list[str]
    provider: str | None = None
    model: str | None = None
    latency_ms: int | None = None
    fallback_used: bool = False
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "confidence": self.confidence,
            "reason": self.reason,
            "missing_evidence": list(self.missing_evidence),
            "provider": self.provider,
            "model": self.model,
            "latency_ms": self.latency_ms,
            "fallback_used": self.fallback_used,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _truncate(text: str | None, max_chars: int) -> str:
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[: max(0, max_chars - 3)] + "..."


def _build_evidence_block(top_evidence: list[dict], max_total: int) -> str:
    """Build a bounded evidence block for the LLM prompt.

    Each row is rendered as::

        [1] path/to/file.py :: symbol_name (kind)
            snippet text (masked + truncated)

    Total length is bounded by ``max_total`` to keep prompts predictable.
    """
    lines: list[str] = []
    used = 0
    for idx, item in enumerate(top_evidence[:MAX_EVIDENCE_ROWS], start=1):
        path = _truncate(str(item.get("path", "")), 200)
        symbol = _truncate(str(item.get("symbol_name", "")), 120)
        kind = _truncate(str(item.get("symbol_kind", "") or "symbol"), 32)
        snippet = mask_secrets(_truncate(str(item.get("snippet", "") or ""), MAX_SNIPPET_CHARS))
        block = f"[{idx}] {path} :: {symbol} ({kind})\n{snippet}"
        if used + len(block) > max_total:
            remaining = max(0, max_total - used - 32)
            if remaining < 80:
                break
            block = block[:remaining] + "\n... (truncated)"
            lines.append(block)
            break
        lines.append(block)
        used += len(block) + 2
    return "\n\n".join(lines)


def _build_prompt(
    requirement: RequirementItem,
    evidence_block: str,
    *,
    heuristic_status: str,
    heuristic_confidence: int,
) -> str:
    parts: list[str] = [
        "Đánh giá mức độ source code đáp ứng yêu cầu sau đây.",
        "",
        f"YÊU CẦU (code: {requirement.code})",
        f"Tiêu đề: {requirement.title}",
    ]
    if requirement.text:
        parts.append(f"Mô tả: {_truncate(requirement.text, 1000)}")
    if requirement.actors:
        parts.append(f"Tác nhân: {', '.join(requirement.actors)}")
    if requirement.keywords:
        parts.append(f"Keyword: {', '.join(requirement.keywords[:10])}")
    if requirement.citation:
        cit = requirement.citation
        parts.append(
            f"Citation: {cit.get('document', '?')} - {cit.get('section', '?')}"
        )
    parts.append("")
    parts.append("EVIDENCE (đã được heuristic lọc, tối đa 3 dòng):")
    parts.append(evidence_block or "(không có evidence)")
    parts.append("")
    parts.append(
        f"Heuristic ban đầu: status={heuristic_status}, confidence={heuristic_confidence}."
        " Bạn có thể refine nhưng phải dựa trên evidence đã cho."
    )
    parts.append("")
    parts.append("Trả về JSON đúng schema ở system prompt.")
    return "\n".join(parts)


def _strip_fences(text: str) -> str:
    """Strip ```json ... ``` fences if the model added them."""
    m = _JSON_FENCE.search(text or "")
    if m:
        return m.group(1)
    return (text or "").strip()


def _clamp_int(value: Any, lo: int = 0, hi: int = 100) -> int:
    try:
        ivalue = int(value)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, ivalue))


def _normalize_status(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    low = value.strip().lower()
    # Accept "insufficient" / "insufficient-evidence" / "insufficient_evidence"
    low = low.replace("-", "_")
    if low in ALLOWED_STATUSES:
        return low
    # Fuzzy
    if "match" in low and "partial" not in low and "no" not in low:
        return "matched"
    if "partial" in low:
        return "partial"
    if "insufficient" in low:
        return "insufficient_evidence"
    if "not_found" in low or "not found" in low or "no_evidence" in low:
        return "not_found"
    return ""


def _parse_response(content: str) -> dict[str, Any] | None:
    text = _strip_fences(content)
    if not text:
        return None
    # Try direct
    try:
        data = json.loads(text)
    except Exception:
        # Try to find the first {...} block
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except Exception:
            return None
    if not isinstance(data, dict):
        return None
    return data


def _coerce_result(
    data: dict[str, Any],
    *,
    fallback_status: str,
    fallback_confidence: int,
    fallback_missing: Iterable[str],
) -> SynthesizerResult:
    status = _normalize_status(data.get("status")) or fallback_status
    if status not in ALLOWED_STATUSES:
        status = fallback_status
    confidence = _clamp_int(data.get("confidence"), 0, 100)
    if confidence == 0 and fallback_confidence > 0:
        # Many models omit confidence; keep heuristic in that case.
        confidence = fallback_confidence
    reason = str(data.get("reason") or "").strip()[:1000]
    raw_missing = data.get("missing_evidence") or []
    if not isinstance(raw_missing, list):
        raw_missing = []
    missing: list[str] = []
    for item in raw_missing:
        if item is None:
            continue
        token = str(item).strip()[:80]
        if token and token not in missing:
            missing.append(token)
        if len(missing) >= 5:
            break
    if not missing:
        missing = [str(m) for m in fallback_missing][:5]
    return SynthesizerResult(
        status=status,
        confidence=confidence,
        reason=reason,
        missing_evidence=missing,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def synthesize_match_explanation(
    requirement: RequirementItem,
    top_evidence: list[dict],
    *,
    heuristic_status: str,
    heuristic_confidence: int,
    heuristic_missing: list[str] | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> SynthesizerResult:
    """Call AIGateway to refine a single requirement match explanation.

    Returns a ``SynthesizerResult`` whose ``fallback_used=True`` when the AI
    is unavailable or returned invalid JSON. The worker can persist the
    result unconditionally — no exception is raised to the caller.
    """
    heuristic_missing = list(heuristic_missing or [])

    # Defensive defaults: if heuristic status is not allowed, force insufficient.
    fallback_status = _normalize_status(heuristic_status) or "insufficient_evidence"
    fallback_confidence = _clamp_int(heuristic_confidence, 0, 100)
    fallback_result = SynthesizerResult(
        status=fallback_status,
        confidence=fallback_confidence,
        reason="AI review unavailable — using heuristic result.",
        missing_evidence=[str(m) for m in heuristic_missing][:5],
        fallback_used=True,
    )

    # Build bounded evidence + prompt
    evidence_block = _build_evidence_block(top_evidence, MAX_TOTAL_PROMPT_CHARS // 2)
    prompt = _build_prompt(
        requirement,
        evidence_block,
        heuristic_status=fallback_status,
        heuristic_confidence=fallback_confidence,
    )
    if len(prompt) > MAX_TOTAL_PROMPT_CHARS:
        prompt = _truncate(prompt, MAX_TOTAL_PROMPT_CHARS)

    attempts = max(1, LLM_RETRY_ATTEMPTS)
    last_error: str | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = await ai_gateway.generate(
                prompt=prompt,
                provider=provider,
                model=model,
                system_prompt=_SYSTEM_PROMPT,
                temperature=0.0,
                max_tokens=600,
            )
        except Exception as exc:  # noqa: BLE001
            last_error = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "Synthesizer attempt %d/%d failed: %s",
                attempt,
                attempts,
                last_error,
            )
            continue

        content = (response or {}).get("content") or ""
        data = _parse_response(content)
        if data is None:
            last_error = "invalid_json"
            logger.warning("Synthesizer attempt %d/%d returned invalid JSON", attempt, attempts)
            continue

        result = _coerce_result(
            data,
            fallback_status=fallback_status,
            fallback_confidence=fallback_confidence,
            fallback_missing=heuristic_missing,
        )
        result.provider = (response or {}).get("provider")
        result.model = (response or {}).get("model")
        result.latency_ms = (response or {}).get("latency_ms")
        return result

    fallback_result.error = last_error or "ai_unavailable"
    return fallback_result