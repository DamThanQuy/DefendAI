"""Rules service — bảng rule check BR-B1 (agent đề xuất, hội đồng quyết).

Mỗi rule là 1 hàm pure: input = project facts, output = RuleResult.
Trạng thái: pass | violated | pending_data | na
- pass:        agent tính được, đạt ngưỡng
- violated:    agent tính được, vi phạm (🔴)
- pending_data: agent chưa có input (BR-B2/B3 chưa chạy) → 🟡
- na:          agent không tính được (rule hội đồng-tick) → ⚪

KHÔNG có verdict cuối — chỉ đề xuất. Hội đồng override/bổ sung qua
CommitteeDecision.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional

from app.services.rubric_service import get_rubric_by_key
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class RuleResult:
    rule_id: str
    rule_name: str
    auto_status: str  # pass | violated | pending_data | na
    input_summary: str
    evidence: list[str] = field(default_factory=list)
    needs_human: bool = False  # rule bắt buộc hội đồng tick


# ===== 4 rule agent tự tính =====


async def _rubric_subject(db: AsyncSession) -> dict[str, Any]:
    rubric = await get_rubric_by_key(db, "defense_sep490")
    if not rubric:
        return {"min_avg_to_pass": 5, "min_oga_to_pass": 5}
    return rubric.config.get("subject", {})


def rule_R_FAIL_1(oga_score: Optional[Decimal], subject: dict[str, Any]) -> RuleResult:
    """R-FAIL-1: OGA < 5/10 → cấm bảo vệ (syllabus §5.1)."""
    threshold = Decimal(str(subject.get("min_oga_to_pass", 5)))
    if oga_score is None:
        return RuleResult(
            rule_id="R-FAIL-1",
            rule_name="OGA < 5/10 → cấm bảo vệ",
            auto_status="pending_data",
            input_summary="chưa có điểm OGA",
            evidence=[f"threshold={threshold} (syllabus §5.1)"],
        )
    if Decimal(str(oga_score)) < threshold:
        return RuleResult(
            rule_id="R-FAIL-1",
            rule_name="OGA < 5/10 → cấm bảo vệ",
            auto_status="violated",
            input_summary=f"OGA={float(oga_score):.1f}",
            evidence=[f"OGA {float(oga_score):.1f} < {threshold} (rubrics.defense_sep490.subject.min_oga_to_pass)"],
        )
    return RuleResult(
        rule_id="R-FAIL-1",
        rule_name="OGA < 5/10 → cấm bảo vệ",
        auto_status="pass",
        input_summary=f"OGA={float(oga_score):.1f}",
        evidence=[f"OGA {float(oga_score):.1f} >= {threshold}"],
    )


def rule_R_DELAY_1(completion_ratio: Optional[float], total_uc: Optional[int], cfg: dict) -> RuleResult:
    """R-DELAY-1: hoàn thành < 75% UC cam kết, HOẶC < 20 UC trung bình (syllabus §5.2)."""
    threshold = cfg.get("completion_ratio", 0.75)
    min_uc = cfg.get("min_uc", 20)
    if completion_ratio is None or total_uc is None:
        return RuleResult(
            rule_id="R-DELAY-1",
            rule_name="UC < 75% cam kết HOẶC < 20 UC → hoãn vòng 2",
            auto_status="pending_data",
            input_summary="chưa đếm UC từ SRS (cần BR-B2)",
            evidence=[f"thresholds: ratio<{threshold} HOẶC total<{min_uc}"],
        )
    fail_ratio = completion_ratio < threshold
    fail_uc = total_uc < min_uc
    if fail_ratio or fail_uc:
        reasons = []
        if fail_ratio:
            reasons.append(f"ratio {completion_ratio:.0%} < {threshold:.0%}")
        if fail_uc:
            reasons.append(f"total UC {total_uc} < {min_uc}")
        return RuleResult(
            rule_id="R-DELAY-1",
            rule_name="UC < 75% cam kết HOẶC < 20 UC → hoãn vòng 2",
            auto_status="violated",
            input_summary=f"UC: {total_uc}, ratio {completion_ratio:.0%}",
            evidence=reasons,
        )
    return RuleResult(
        rule_id="R-DELAY-1",
        rule_name="UC < 75% cam kết HOẶC < 20 UC → hoãn vòng 2",
        auto_status="pass",
        input_summary=f"UC: {total_uc}, ratio {completion_ratio:.0%}",
        evidence=[f"ratio {completion_ratio:.0%} >= {threshold:.0%}, UC {total_uc} >= {min_uc}"],
    )


def rule_R_DELAY_3(n_logic: Optional[int], n_showstopper: Optional[int], cfg: dict) -> RuleResult:
    """R-DELAY-3: > 3 lỗi logic, HOẶC > 1 show-stopper (syllabus §5.2)."""
    if n_logic is None or n_showstopper is None:
        return RuleResult(
            rule_id="R-DELAY-3",
            rule_name="> 3 lỗi logic HOẶC > 1 show-stopper → hoãn vòng 2",
            auto_status="pending_data",
            input_summary="chưa quét code/test (cần BR-B3)",
            evidence=[f"thresholds: n_logic>{cfg.get('max_logic',3)} HOẶC n_showstopper>{cfg.get('max_showstopper',1)}"],
        )
    fail_logic = n_logic > cfg.get("max_logic", 3)
    fail_ss = n_showstopper > cfg.get("max_showstopper", 1)
    if fail_logic or fail_ss:
        reasons = []
        if fail_logic:
            reasons.append(f"n_logic {n_logic} > {cfg.get('max_logic', 3)}")
        if fail_ss:
            reasons.append(f"n_showstopper {n_showstopper} > {cfg.get('max_showstopper', 1)}")
        return RuleResult(
            rule_id="R-DELAY-3",
            rule_name="> 3 lỗi logic HOẶC > 1 show-stopper → hoãn vòng 2",
            auto_status="violated",
            input_summary=f"logic={n_logic}, show_stopper={n_showstopper}",
            evidence=reasons,
        )
    return RuleResult(
        rule_id="R-DELAY-3",
        rule_name="> 3 lỗi logic HOẶC > 1 show-stopper → hoãn vòng 2",
        auto_status="pass",
        input_summary=f"logic={n_logic}, show_stopper={n_showstopper}",
        evidence=[f"n_logic {n_logic} <= {cfg.get('max_logic', 3)}, n_showstopper {n_showstopper} <= {cfg.get('max_showstopper', 1)}"],
    )


# ===== 3 rule hội đồng tự tick (luôn "na" — không agent tự tính) =====


def rule_R_DELAY_2() -> RuleResult:
    return RuleResult(
        rule_id="R-DELAY-2",
        rule_name="Không chứng minh tự chuẩn bị → hoãn vòng 2",
        auto_status="na",
        input_summary="—",
        evidence=[],
        needs_human=True,
    )


def rule_R_REDO() -> RuleResult:
    return RuleResult(
        rule_id="R-REDO",
        rule_name="Rớt vòng 2 HOẶC OGA < 2/10 → phải làm lại đồ án",
        auto_status="na",
        input_summary="—",
        evidence=[],
        needs_human=True,
    )


def rule_R_INDIV() -> RuleResult:
    return RuleResult(
        rule_id="R-INDIV",
        rule_name="Cá nhân không demo được → rớt cá nhân",
        auto_status="na",
        input_summary="—",
        evidence=[],
        needs_human=True,
    )


def rule_R_CAP(cap_enabled: bool) -> RuleResult:
    """R-CAP: bảo vệ lại → điểm cap 80% (config toggle, chờ xác minh chính thức)."""
    if not cap_enabled:
        return RuleResult(
            rule_id="R-CAP",
            rule_name="Bảo vệ lại cap 80% điểm (chờ xác minh chính thức)",
            auto_status="na",
            input_summary="config: R-CAP disabled (mặc định)",
            evidence=[],
            needs_human=True,
        )
    return RuleResult(
        rule_id="R-CAP",
        rule_name="Bảo vệ lại cap 80% điểm",
        auto_status="pass",
        input_summary="config: R-CAP enabled",
        evidence=["admin config: rules.r_cap.enabled=true"],
    )


# ===== entry point =====


async def evaluate_all_rules(
    db: AsyncSession,
    oga_score: Optional[Decimal],
    completion_ratio: Optional[float] = None,
    total_uc: Optional[int] = None,
    n_logic: Optional[int] = None,
    n_showstopper: Optional[int] = None,
) -> list[RuleResult]:
    subject = await _rubric_subject(db)
    rcap_enabled = False  # Phase 0: chờ xác minh → mặc định tắt
    return [
        rule_R_FAIL_1(oga_score, subject),
        rule_R_DELAY_1(completion_ratio, total_uc, {}),
        rule_R_DELAY_3(n_logic, n_showstopper, {}),
        rule_R_DELAY_2(),
        rule_R_REDO(),
        rule_R_INDIV(),
        rule_R_CAP(rcap_enabled),
    ]


def to_dict(r: RuleResult) -> dict:
    return {
        "rule_id": r.rule_id,
        "rule_name": r.rule_name,
        "auto_status": r.auto_status,
        "input_summary": r.input_summary,
        "evidence": r.evidence,
        "needs_human": r.needs_human,
    }
