"""Tests for Step 3 (M1 + M2) of the ZIP/BR consistency analysis pipeline.

Covers:
- requirement_extractor.extract_requirements_from_text
- evidence_matcher.score_evidence
- evidence_matcher.decide_status
- evidence_matcher.persist_match
- evidence_matcher.derive_missing_evidence
- matching_pipeline._guess_prefix
- stable_requirement_hash idempotency

All tests are pure-Python (no DB / network) and run alongside the existing
Step 1 + Step 2 suites.
"""
from __future__ import annotations

from typing import Any, List
from unittest.mock import AsyncMock

import pytest

from app.handlers.matching_pipeline import _guess_prefix
from app.models.entities import MatchStatus
from app.services.evidence_matcher import (
    EvidenceCandidate,
    ScoredCandidate,
    THRESHOLD_INSUFFICIENT,
    THRESHOLD_MATCHED,
    THRESHOLD_PARTIAL,
    decide_status,
    derive_missing_evidence,
    pick_top_evidence,
    score_evidence,
)
from app.services.requirement_extractor import (
    RequirementItem,
    extract_requirements_from_text,
    stable_requirement_hash,
)


# ---------------------------------------------------------------------------
# M1 — requirement_extractor
# ---------------------------------------------------------------------------
class TestRequirementExtraction:
    def test_extracts_uc_with_existing_code(self):
        text = """
        3.1 UC-01 Login
        Người dùng nhập username + password.
        Actor: Người dùng
        Pre: Tài khoản tồn tại
        Post: Đăng nhập thành công

        3.2 UC-02 Upload document
        Người dùng tải lên file ZIP.
        Actor: Người dùng
        """
        items = extract_requirements_from_text(text, document_name="br.docx")
        assert len(items) == 2
        assert items[0].code == "UC-01"
        assert items[0].title.lower().startswith("login")
        assert "người dùng" in [a.lower() for a in items[0].actors]
        assert items[1].code == "UC-02"
        assert "upload" in items[1].title.lower()

    def test_generates_codes_when_missing(self):
        text = """
        Use case 1: Upload file
        Mô tả: người dùng upload file.
        Actor: Người dùng

        Use case 2: Phân tích file
        Mô tả: hệ thống phân tích file ZIP.
        Actor: Hệ thống
        """
        items = extract_requirements_from_text(text, document_name="uc.md")
        assert [i.code for i in items] == ["UC-01", "UC-02"]
        # Title is normalised — leading "Use case" is trimmed.
        assert "upload" in items[0].title.lower()
        assert "phân tích" in items[1].title.lower()

    def test_falls_back_to_requirements_prefix(self):
        text = """
        4.1 Requirement: Forgot password
        Hệ thống gửi email reset.
        """
        items = extract_requirements_from_text(
            text, document_name="srs.docx", fallback_prefix="REQ"
        )
        assert len(items) == 1
        assert items[0].code.startswith("REQ-")

    def test_returns_empty_for_blank_or_unstructured(self):
        assert extract_requirements_from_text("", document_name="x") == []
        assert extract_requirements_from_text("   \n\n", document_name="x") == []
        # No heading keywords, no numbered section => nothing.
        assert extract_requirements_from_text("hello world", document_name="x") == []

    def test_keywords_extracted_from_text(self):
        text = """
        3.1 UC-01 Quản lý kho
        Người dùng quản lý kho sản phẩm với CRUD đầy đủ.
        """
        items = extract_requirements_from_text(text, document_name="uc.md")
        assert items
        # 'quản' alone may be filtered, but product-related tokens stay
        joined = " ".join(items[0].keywords)
        assert "kho" in joined or "sản" in joined or "phẩm" in joined

    def test_citation_includes_document_and_section(self):
        text = """
        2.1 UC-01 Đăng nhập
        Mô tả ngắn.
        """
        items = extract_requirements_from_text(text, document_name="br.docx")
        assert items[0].citation["document"] == "br.docx"
        assert items[0].citation["section"]

    def test_stable_hash_changes_only_with_content(self):
        items1 = [
            RequirementItem(code="UC-01", title="A", keywords=["a", "b"]),
            RequirementItem(code="UC-02", title="B", keywords=["c"]),
        ]
        items2 = list(reversed(items1))  # order should not matter
        assert stable_requirement_hash(items1) == stable_requirement_hash(items2)

        items3 = [RequirementItem(code="UC-01", title="A", keywords=["a", "x"])]
        assert stable_requirement_hash(items1) != stable_requirement_hash(items3)


# ---------------------------------------------------------------------------
# M2 — evidence_matcher
# ---------------------------------------------------------------------------
def _candidate(**overrides: Any) -> EvidenceCandidate:
    base = dict(
        id=1,
        path="apps/api/app/routers/upload.py",
        language="python",
        symbol_name="upload_document",
        symbol_kind="function",
        routes=["POST /api/upload"],
        calls=["save_file", "validate_zip"],
        keywords=["upload", "document", "zip"],
        snippet="def upload_document(): pass",
    )
    base.update(overrides)
    return EvidenceCandidate(**base)


class TestEvidenceScoring:
    def test_path_and_symbol_match_give_max(self):
        item = RequirementItem(
            code="UC-01",
            title="Upload document",
            text="Người dùng upload tài liệu",
            keywords=["upload", "document"],
        )
        scored = score_evidence(item, _candidate())
        # path 0.10 + symbol 0.35 + business 0.25 (3/3 jaccard) + vector 0
        assert scored.path_score == 0.10
        assert scored.symbol_score == 0.35
        assert scored.business_score > 0
        # Total should at least be in the "partial" tier.
        assert scored.total >= THRESHOLD_PARTIAL

    def test_no_match_returns_zero(self):
        item = RequirementItem(
            code="UC-02",
            title="Thanh toán",
            text="Thanh toán qua thẻ tín dụng",
            keywords=["thanh", "toán", "credit"],
        )
        scored = score_evidence(item, _candidate())
        assert scored.path_score == 0.0
        assert scored.symbol_score == 0.0
        assert scored.total == 0.0

    def test_ui_match_only_counts_in_ui_languages(self):
        item = RequirementItem(
            code="UC-03",
            title="Login form",
            keywords=["login", "form"],
        )
        # python candidate: no UI bonus.
        py = score_evidence(item, _candidate())
        # Vue candidate: UI bonus kicks in.
        vue = score_evidence(item, _candidate(language="vue", snippet="<form login>"))
        assert py.ui_score == 0.0
        assert vue.ui_score == 0.20

    def test_model_path_hints(self):
        item = RequirementItem(code="UC-04", title="Schema", keywords=["user", "model"])
        cand = _candidate(
            id=2,
            path="app/models/user.py",
            symbol_name="User",
            routes=[],
            calls=[],
            keywords=[],
            snippet="class User(Base): pass",
        )
        scored = score_evidence(item, cand)
        # Symbol 0.35 (matches "user") + model 0.10 + path 0.10 (user.py)
        assert scored.symbol_score == 0.35
        assert scored.model_score == 0.10
        assert scored.path_score == 0.10

    def test_vector_bonus_capped(self):
        item = RequirementItem(code="UC-05", title="X", keywords=["a"])
        cand = _candidate()
        scored = score_evidence(item, cand, vector_similarity=0.99)
        assert scored.vector_bonus <= 0.15
        # Total must remain within [0, 1].
        assert scored.total <= 1.0


class TestDecideStatus:
    def test_thresholds(self):
        assert decide_status(0.85, evidence_count=2) == MatchStatus.matched
        assert decide_status(0.75, evidence_count=1) == MatchStatus.partial  # only 1 evidence
        assert decide_status(0.50, evidence_count=1) == MatchStatus.partial
        assert decide_status(0.20, evidence_count=0) == MatchStatus.insufficient_evidence
        assert decide_status(0.05, evidence_count=0) == MatchStatus.not_found


class TestPickTopEvidence:
    def test_returns_top_k_sorted(self):
        candidates = [_candidate(id=i, path=f"f{i}.py") for i in range(5)]
        scored: List[ScoredCandidate] = []
        for i, c in enumerate(candidates):
            s = ScoredCandidate(candidate=c)
            s.total = i / 10  # 0.0, 0.1, 0.2, 0.3, 0.4
            scored.append(s)
        top = pick_top_evidence(scored, top_k=3)
        assert [s.candidate.id for s in top] == [4, 3, 2]


class TestDeriveMissingEvidence:
    def test_lists_uncovered_keywords(self):
        item = RequirementItem(
            code="UC-06",
            title="Export PDF",
            text="Xuất báo cáo PDF",
            keywords=["export", "pdf", "report"],
        )
        cand = _candidate(
            id=99,
            path="app/services/pdf.py",
            symbol_name="export_pdf",
            routes=[],
            calls=[],
            keywords=["export", "pdf"],
            snippet="",
        )
        scored = [score_evidence(item, cand)]
        missing = derive_missing_evidence(item, scored)
        assert "report" in missing
        assert "export" not in missing
        assert "pdf" not in missing


# ---------------------------------------------------------------------------
# Persistence — verify RequirementMatch is created/updated
# ---------------------------------------------------------------------------
class TestPersistMatch:
    @pytest.mark.asyncio
    async def test_creates_match_when_absent(self):
        item = RequirementItem(code="UC-10", title="X", keywords=["x"])
        # Build a high-score candidate.
        cand = _candidate(id=1, path="x.py", symbol_name="x_handler", keywords=["x"])

        # Mock session — db.execute() returns a sync-style result that exposes
        # ``scalar_one_or_none()``. Existing rows are absent (None).
        from unittest.mock import MagicMock

        db = AsyncMock()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = None
        db.execute.return_value = execute_result
        db.add = MagicMock()
        db.flush = AsyncMock()

        from app.services.evidence_matcher import persist_match

        scored = [score_evidence(item, cand)]
        match = await persist_match(
            db,
            analysis_job_id=1,
            workspace_id=1,
            requirement=item,
            scored=scored,
            analyzer_version="step3-v1",
        )
        assert match.requirement_code == "UC-10"
        assert db.add.called
        assert match.status in {MatchStatus.matched, MatchStatus.partial}

    @pytest.mark.asyncio
    async def test_updates_existing_match(self):
        item = RequirementItem(code="UC-11", title="Y", keywords=["y"])
        cand = _candidate(id=1, path="y.py", symbol_name="y_handler", keywords=["y"])

        from unittest.mock import MagicMock

        existing = MagicMock()
        existing.evidence_json = []
        existing.missing_evidence_json = []
        existing.requirement_title = "stale"

        db = AsyncMock()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = existing
        db.execute.return_value = execute_result
        db.flush = AsyncMock()

        from app.services.evidence_matcher import persist_match

        scored = [score_evidence(item, cand)]
        match = await persist_match(
            db,
            analysis_job_id=1,
            workspace_id=1,
            requirement=item,
            scored=scored,
            analyzer_version="step3-v1",
        )
        assert match is existing
        assert existing.requirement_title == "Y"
        assert db.add.call_count == 0  # did not re-add


# ---------------------------------------------------------------------------
# matching_pipeline helpers
# ---------------------------------------------------------------------------
class TestGuessPrefix:
    def test_srs_doc_uses_req(self):
        assert _guess_prefix("SRS-final.docx") == "REQ"

    def test_nfr_doc_uses_nfr(self):
        assert _guess_prefix("nfr-doc.docx") == "NFR"

    def test_business_rule_uses_br(self):
        assert _guess_prefix("business-rules.pdf") == "BR"

    def test_default_uc(self):
        assert _guess_prefix("random-name.docx") == "UC"


# ---------------------------------------------------------------------------
# Idempotency helper
# ---------------------------------------------------------------------------
class TestScoreIntegration:
    def test_full_workflow_score_above_partial(self):
        """Realistic case: requirement clearly matches evidence with high score."""
        item = RequirementItem(
            code="UC-20",
            title="Upload tài liệu",
            text="Người dùng upload ZIP lên hệ thống để phân tích",
            keywords=["upload", "zip", "tài", "liệu"],
        )
        cand = EvidenceCandidate(
            id=1,
            path="app/api/upload.py",
            language="python",
            symbol_name="upload_zip",
            symbol_kind="function",
            routes=["POST /api/upload"],
            calls=["extract_zip"],
            keywords=["upload", "zip"],
            snippet="def upload_zip(): pass",
        )
        scored = score_evidence(item, cand)
        # 0.10 (path) + 0.35 (symbol) + 0.25 (business ~0.75) >= 0.7
        assert scored.total >= THRESHOLD_PARTIAL
