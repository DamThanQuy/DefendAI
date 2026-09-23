"""Tests for Step 4 (A1) of the ZIP/BR consistency analysis pipeline.

Covers:
- evidence_synthesizer.mask_secrets
- evidence_synthesizer._build_evidence_block
- evidence_synthesizer._build_prompt
- evidence_synthesizer._parse_response
- evidence_synthesizer._normalize_status
- evidence_synthesizer._coerce_result
- evidence_synthesizer.synthesize_match_explanation (mocked AIGateway)
- explanation_pipeline handler logic (mocked DB + job queue)

All tests are pure-Python (no DB / network) and run alongside the existing
Step 1 + Step 2 + Step 3 suites.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.evidence_synthesizer import (
    MAX_EVIDENCE_ROWS,
    MAX_SNIPPET_CHARS,
    MAX_TOTAL_PROMPT_CHARS,
    _build_evidence_block,
    _build_prompt,
    _clamp_int,
    _coerce_result,
    _normalize_status,
    _parse_response,
    _strip_fences,
    _truncate,
    mask_secrets,
    synthesize_match_explanation,
    SynthesizerResult,
)
from app.services.requirement_extractor import RequirementItem


# ---------------------------------------------------------------------------
# Secret masking
# ---------------------------------------------------------------------------
class TestMaskSecrets:
    def test_masks_api_key_pattern(self):
        # The value (abc123XYZ789) after token= is replaced.
        text = "Bearer token: abc123XYZ789"
        masked = mask_secrets(text)
        assert "abc123XYZ789" not in masked
        assert "[REDACTED]" in masked

    def test_masks_bearer_token(self):
        text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
        masked = mask_secrets(text)
        assert "Bearer eyJ" not in masked
        assert "[REDACTED]" in masked

    def test_masks_private_key(self):
        text = "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAL\n-----END RSA PRIVATE KEY-----"
        masked = mask_secrets(text)
        assert "PRIVATE KEY" not in masked
        assert "[REDACTED]" in masked

    def test_masks_openai_sk_key(self):
        text = "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
        masked = mask_secrets(text)
        assert "sk-ABC" not in masked
        assert "[REDACTED]" in masked

    def test_masks_github_token(self):
        text = "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
        masked = mask_secrets(text)
        assert "ghp_" not in masked
        assert "[REDACTED]" in masked

    def test_masks_google_api_key(self):
        text = "AIzaSyabcdefghijklmnopqrstuvwxyz123456789"
        masked = mask_secrets(text)
        assert "AIza" not in masked
        assert "[REDACTED]" in masked

    def test_passthrough_for_clean_text(self):
        text = "This is a clean code snippet with no secrets."
        masked = mask_secrets(text)
        assert masked == text

    def test_empty_string_unchanged(self):
        assert mask_secrets("") == ""
        assert mask_secrets(None) is None


# ---------------------------------------------------------------------------
# Evidence block builder
# ---------------------------------------------------------------------------
class TestBuildEvidenceBlock:
    def _ev(self, **kw) -> dict:
        base = dict(
            path="app/api/upload.py",
            symbol_name="upload_document",
            symbol_kind="function",
            snippet="def upload_document(): pass",
        )
        base.update(kw)
        return base

    def test_respects_max_rows(self):
        evidence = [self._ev(id=i) for i in range(5)]
        block = _build_evidence_block(evidence, max_total=100_000)
        # Count [1], [2], [3] markers
        assert block.count("[1]") == 1
        assert block.count("[2]") == 1
        assert block.count("[3]") == 1
        assert "[4]" not in block

    def test_truncates_long_snippet(self):
        long_snippet = "x" * 10_000
        evidence = [self._ev(snippet=long_snippet)]
        block = _build_evidence_block(evidence, max_total=50_000)
        assert "..." in block
        assert long_snippet not in block

    def test_respects_max_total(self):
        # Many short rows should stop before exceeding max_total.
        evidence = [self._ev(id=i, snippet=f"line {i}: " + "x" * 200) for i in range(10)]
        block = _build_evidence_block(evidence, max_total=3_000)
        # Should have at least one row.
        assert "[1]" in block
        # Should not have all 10 rows (would exceed 3KB).
        assert block.count("[") <= 5

    def test_empty_evidence_returns_empty_block(self):
        assert _build_evidence_block([], max_total=1_000) == ""

    def test_handles_missing_fields(self):
        evidence = [{"path": "a.py"}]  # missing symbol_name, snippet
        block = _build_evidence_block(evidence, max_total=10_000)
        assert "a.py" in block


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------
class TestBuildPrompt:
    def _req(self, **kw) -> RequirementItem:
        base = dict(
            code="UC-01",
            title="Upload document",
            text="Người dùng upload tài liệu",
            keywords=["upload", "document"],
            actors=["Người dùng"],
            citation={"document": "br.docx", "section": "3.3"},
        )
        base.update(kw)
        return RequirementItem(**base)

    def test_includes_requirement_code(self):
        req = self._req()
        block = "evidence here"
        prompt = _build_prompt(req, block, heuristic_status="matched", heuristic_confidence=85)
        assert "UC-01" in prompt
        assert "Upload document" in prompt

    def test_includes_evidence_block(self):
        req = self._req()
        block = "[1] app/a.py :: func_a\nsnippet text"
        prompt = _build_prompt(req, block, heuristic_status="partial", heuristic_confidence=60)
        assert "evidence here" in prompt or "snippet text" in prompt

    def test_includes_heuristic_context(self):
        req = self._req()
        prompt = _build_prompt(req, "ev", heuristic_status="matched", heuristic_confidence=90)
        assert "status=matched" in prompt
        assert "confidence=90" in prompt

    def test_includes_actors(self):
        req = self._req()
        prompt = _build_prompt(req, "ev", heuristic_status="a", heuristic_confidence=0)
        assert "Người dùng" in prompt

    def test_includes_citation(self):
        req = self._req()
        prompt = _build_prompt(req, "ev", heuristic_status="a", heuristic_confidence=0)
        assert "br.docx" in prompt
        assert "3.3" in prompt  # matches the fixture citation section

    def test_truncates_very_long_text(self):
        req = self._req(text="x" * 5_000)
        prompt = _build_prompt(req, "ev", heuristic_status="a", heuristic_confidence=0)
        # The entire prompt should be bounded.
        assert len(prompt) < MAX_TOTAL_PROMPT_CHARS * 2


# ---------------------------------------------------------------------------
# JSON parsing helpers
# ---------------------------------------------------------------------------
class TestParseResponse:
    def test_parses_plain_json(self):
        data = {"status": "matched", "confidence": 85, "reason": "good", "missing_evidence": []}
        content = json.dumps(data)
        result = _parse_response(content)
        assert result is not None
        assert result["status"] == "matched"

    def test_strips_json_fence(self):
        content = '```json\n{"status": "partial", "confidence": 70, "reason": "ok", "missing_evidence": []}\n```'
        result = _parse_response(content)
        assert result is not None
        assert result["status"] == "partial"

    def test_strips_json_fence_without_language_tag(self):
        content = '```\n{"status": "not_found", "confidence": 10, "reason": "nope", "missing_evidence": []}\n```'
        result = _parse_response(content)
        assert result is not None
        assert result["status"] == "not_found"

    def test_extracts_from_wrapped_text(self):
        content = 'Some explanation before.\n{"status": "matched", "confidence": 90, "reason": "yes", "missing_evidence": []}\nMore text after.'
        result = _parse_response(content)
        assert result is not None
        assert result["confidence"] == 90

    def test_returns_none_for_invalid_json(self):
        assert _parse_response("not json at all") is None
        assert _parse_response("") is None
        assert _parse_response('{"status": "matched", missing quotes}') is None

    def test_returns_none_for_non_dict(self):
        assert _parse_response('[1, 2, 3]') is None
        assert _parse_response('"just a string"') is None


# ---------------------------------------------------------------------------
# Status normalization
# ---------------------------------------------------------------------------
class TestNormalizeStatus:
    def test_exact_match(self):
        assert _normalize_status("matched") == "matched"
        assert _normalize_status("partial") == "partial"
        assert _normalize_status("not_found") == "not_found"
        assert _normalize_status("insufficient_evidence") == "insufficient_evidence"

    def test_insufficient_variants(self):
        assert _normalize_status("insufficient") == "insufficient_evidence"
        assert _normalize_status("insufficient-evidence") == "insufficient_evidence"
        assert _normalize_status("INSUFFICIENT_EVIDENCE") == "insufficient_evidence"

    def test_not_found_variants(self):
        assert _normalize_status("not found") == "not_found"
        assert _normalize_status("no_evidence") == "not_found"

    def test_fuzzy_match(self):
        assert _normalize_status("matched!") == "matched"
        assert _normalize_status("partial-match") == "partial"

    def test_empty_for_unknown(self):
        assert _normalize_status("completely-wrong") == ""
        assert _normalize_status("") == ""


# ---------------------------------------------------------------------------
# Coercion
# ---------------------------------------------------------------------------
class TestCoerceResult:
    def test_uses_fallback_for_missing_status(self):
        data = {"confidence": 80, "reason": "ok", "missing_evidence": []}
        result = _coerce_result(
            data,
            fallback_status="matched",
            fallback_confidence=85,
            fallback_missing=["a"],
        )
        assert result.status == "matched"
        assert result.confidence == 80

    def test_clamps_confidence(self):
        data = {"status": "matched", "confidence": 150, "reason": "x", "missing_evidence": []}
        result = _coerce_result(data, fallback_status="a", fallback_confidence=0, fallback_missing=[])
        assert result.confidence == 100

        # -10 → clamped to 0. Since 0 is treated as "AI omitted", the
        # heuristic (0) is kept, so result == 0.
        data2 = {"status": "matched", "confidence": -10, "reason": "x", "missing_evidence": []}
        result2 = _coerce_result(data2, fallback_status="a", fallback_confidence=0, fallback_missing=[])
        assert result2.confidence == 0

    def test_keeps_heuristic_confidence_when_ai_omits(self):
        # Many models omit confidence; keep heuristic.
        data = {"status": "matched", "confidence": 0, "reason": "ok", "missing_evidence": []}
        result = _coerce_result(data, fallback_status="a", fallback_confidence=75, fallback_missing=[])
        assert result.confidence == 75

    def test_missing_reason_defaults_to_empty(self):
        data = {"status": "partial"}
        result = _coerce_result(data, fallback_status="a", fallback_confidence=0, fallback_missing=[])
        assert result.reason == ""

    def test_missing_evidence_falls_back_to_heuristic(self):
        data = {"status": "matched", "confidence": 80, "reason": "ok"}
        result = _coerce_result(
            data,
            fallback_status="a",
            fallback_confidence=0,
            fallback_missing=["kw1", "kw2"],
        )
        assert "kw1" in result.missing_evidence or "kw2" in result.missing_evidence

    def test_missing_evidence_caps_at_5(self):
        data = {"status": "matched", "confidence": 80, "reason": "ok", "missing_evidence": ["a", "b", "c", "d", "e", "f", "g"]}
        result = _coerce_result(data, fallback_status="a", fallback_confidence=0, fallback_missing=[])
        assert len(result.missing_evidence) <= 5


# ---------------------------------------------------------------------------
# Clamp / truncate helpers
# ---------------------------------------------------------------------------
class TestHelpers:
    def test_clamp_int_in_range(self):
        assert _clamp_int(50, 0, 100) == 50

    def test_clamp_int_clamps_high(self):
        assert _clamp_int(150, 0, 100) == 100

    def test_clamp_int_clamps_low(self):
        assert _clamp_int(-5, 0, 100) == 0

    def test_clamp_int_non_int(self):
        assert _clamp_int("bad", 0, 100) == 0
        assert _clamp_int(None, 0, 100) == 0

    def test_truncate_short_text(self):
        assert _truncate("hello", 10) == "hello"

    def test_truncate_long_text(self):
        assert _truncate("hello world", 8) == "hello..."

    def test_truncate_empty(self):
        assert _truncate("", 10) == ""
        assert _truncate(None, 10) == ""


# ---------------------------------------------------------------------------
# Strip fences
# ---------------------------------------------------------------------------
class TestStripFences:
    def test_strips_json_fence(self):
        text = '```json\n{"a": 1}\n```'
        assert _strip_fences(text) == '{"a": 1}'

    def test_strips_fence_without_lang(self):
        text = '```\n{"b": 2}\n```'
        assert _strip_fences(text) == '{"b": 2}'

    def test_passthrough_for_plain_text(self):
        assert _strip_fences('{"c": 3}') == '{"c": 3}'

    def test_strips_whitespace(self):
        assert _strip_fences('  \n{"d": 4}\n  ') == '{"d": 4}'


# ---------------------------------------------------------------------------
# synthesize_match_explanation — AIGateway integration
# ---------------------------------------------------------------------------
class TestSynthesizeMatchExplanation:
    def _req(self, **kw) -> RequirementItem:
        return RequirementItem(
            code="UC-01",
            title="Upload",
            text="Người dùng upload",
            keywords=["upload"],
            actors=[],
            citation={},
            **kw,
        )

    @pytest.mark.asyncio
    async def test_returns_valid_result_on_successful_ai_call(self):
        mock_response = {
            "content": json.dumps({
                "status": "matched",
                "confidence": 90,
                "reason": "Code matches requirement well.",
                "missing_evidence": ["audit_log"],
            }),
            "provider": "local",
            "model": "llama3.1",
            "latency_ms": 123,
        }
        with patch("app.services.evidence_synthesizer.ai_gateway") as mock_gateway:
            mock_gateway.generate = AsyncMock(return_value=mock_response)
            result = await synthesize_match_explanation(
                self._req(),
                [{"path": "a.py", "symbol_name": "f", "snippet": "def f(): pass"}],
                heuristic_status="matched",
                heuristic_confidence=85,
                heuristic_missing=["logging"],
            )
        assert result.status == "matched"
        assert result.confidence == 90
        assert result.reason == "Code matches requirement well."
        assert "audit_log" in result.missing_evidence
        assert result.provider == "local"
        assert result.model == "llama3.1"
        assert result.latency_ms == 123
        assert result.fallback_used is False
        assert result.error is None

    @pytest.mark.asyncio
    async def test_uses_fallback_when_ai_unavailable(self):
        with patch("app.services.evidence_synthesizer.ai_gateway") as mock_gateway:
            mock_gateway.generate = AsyncMock(side_effect=Exception("Connection refused"))
            result = await synthesize_match_explanation(
                self._req(),
                [{"path": "a.py", "symbol_name": "f", "snippet": "def f(): pass"}],
                heuristic_status="partial",
                heuristic_confidence=65,
                heuristic_missing=["error_handling"],
            )
        assert result.status == "partial"
        assert result.confidence == 65
        assert result.fallback_used is True
        assert result.error is not None
        assert "error_handling" in result.missing_evidence

    @pytest.mark.asyncio
    async def test_retry_on_invalid_json(self):
        # First call returns invalid JSON, second call succeeds.
        valid_response = {
            "content": json.dumps({
                "status": "not_found",
                "confidence": 10,
                "reason": "No evidence found.",
                "missing_evidence": [],
            }),
            "provider": "local",
            "model": "llama3",
            "latency_ms": 50,
        }
        call_count = 0

        async def fake_generate(**kw):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"content": "this is not json"}
            return valid_response

        with patch("app.services.evidence_synthesizer.ai_gateway") as mock_gateway:
            mock_gateway.generate = AsyncMock(side_effect=fake_generate)
            result = await synthesize_match_explanation(
                self._req(),
                [{"path": "a.py", "symbol_name": "f", "snippet": "def f(): pass"}],
                heuristic_status="not_found",
                heuristic_confidence=5,
                heuristic_missing=[],
            )
        # Second attempt succeeded
        assert result.status == "not_found"
        assert result.fallback_used is False

    @pytest.mark.asyncio
    async def test_fallback_sets_fallback_used_true(self):
        """When AI returns invalid response after all retries, fallback_used=True."""
        with patch("app.services.evidence_synthesizer.ai_gateway") as mock_gateway:
            mock_gateway.generate = AsyncMock(return_value={"content": "not json"})
            result = await synthesize_match_explanation(
                self._req(),
                [{"path": "a.py", "symbol_name": "f", "snippet": "code"}],
                heuristic_status="insufficient_evidence",
                heuristic_confidence=20,
                heuristic_missing=["logging", "validation"],
            )
        assert result.fallback_used is True
        assert result.status == "insufficient_evidence"
        # missing_evidence should come from heuristic
        assert "logging" in result.missing_evidence

    @pytest.mark.asyncio
    async def test_provider_model_from_response(self):
        mock_response = {
            "content": json.dumps({
                "status": "matched",
                "confidence": 88,
                "reason": "Good.",
                "missing_evidence": [],
            }),
            "provider": "nvidia",
            "model": "llama-3.1-nemotron",
            "latency_ms": 200,
        }
        with patch("app.services.evidence_synthesizer.ai_gateway") as mock_gateway:
            mock_gateway.generate = AsyncMock(return_value=mock_response)
            result = await synthesize_match_explanation(
                self._req(),
                [{"path": "a.py", "symbol_name": "f", "snippet": "def f(): pass"}],
                heuristic_status="matched",
                heuristic_confidence=80,
                heuristic_missing=[],
            )
        assert result.provider == "nvidia"
        assert result.model == "llama-3.1-nemotron"
        assert result.latency_ms == 200


# ---------------------------------------------------------------------------
# SynthesizerResult dataclass
# ---------------------------------------------------------------------------
class TestSynthesizerResult:
    def test_to_dict_returns_all_fields(self):
        result = SynthesizerResult(
            status="matched",
            confidence=85,
            reason="Code covers the requirement.",
            missing_evidence=["audit", "logging"],
            provider="local",
            model="llama3",
            latency_ms=150,
            fallback_used=False,
            error=None,
        )
        d = result.to_dict()
        assert d["status"] == "matched"
        assert d["confidence"] == 85
        assert d["provider"] == "local"
        assert d["model"] == "llama3"
        assert "audit" in d["missing_evidence"]

    def test_fallback_result_has_fallback_used_true(self):
        result = SynthesizerResult(
            status="partial",
            confidence=60,
            reason="AI unavailable.",
            missing_evidence=["x"],
            fallback_used=True,
            error="Connection refused",
        )
        assert result.fallback_used is True
        assert result.error == "Connection refused"
