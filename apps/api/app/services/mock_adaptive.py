"""
Mock Adaptive Service — Adaptive Difficulty + Coverage Enforcement + Hints.

Phase 3: Adaptive Difficulty + Coverage Enforcement + Hints.
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set
from datetime import datetime
from enum import Enum

from app.services.clo_tracker import CLOTracker
from app.services.quality_signals import QualitySignals

logger = logging.getLogger(__name__)


class DifficultyAction(str, Enum):
    DEEPER = "deeper"          # Đi sâu hơn (trade-off, edge cases)
    SAME = "same"              # Giữ nguyên level, hỏi khía cạnh khác
    HINT = "hint"              # Gợi ý từ khóa / rephrase
    SWITCH_CLO = "switch_clo"  # Chuyển CLO khác


class HintLevel(str, Enum):
    KEYWORD = "keyword"           # Chỉ gợi ý từ khóa
    REPHRASE = "rephrase"         # Diễn đạt lại câu hỏi
    STEP_BY_STEP = "step_by_step" # Dẫn dắt từng bước


@dataclass
class DifficultyAdjustment:
    action: str
    target_clo: Optional[str] = None
    reason: str = ""
    hint_level: Optional[str] = None
    hint_text: str = ""


@dataclass
class CoverageAction:
    force_switch: bool = False
    priority_clos: List[str] = field(default_factory=list)
    reason: str = ""


class MockAdaptiveService:
    """
    Adaptive Difficulty + Coverage Enforcement + Hint System.
    
    Orchestrates:
    1. Difficulty adjustment based on answer quality
    2. Coverage enforcement (force switch CLO when needed)
    3. Multi-level hint system
    """
    
    # CLO weights from SEP490 rubric (OGA + TDA combined)
    CLO_WEIGHTS = {
        "CLO1": 0.155,  # SRS: 16+15=31%
        "CLO2": 0.14,   # SDD: 18+10=28%
        "CLO3": 0.335,  # Impl+Testing: 32+35=67% -> 33.5%
        "CLO4": 0.065,  # PMP: 8+5=13%
        "CLO5": 0.045,  # User Guides: 4+5=9%
        "CLO6": 0.075,  # Presentation+QA: 5+10=15%
        "CLO7": 0.185,  # Attitude: special
    }
    
    CLO_NAMES = {
        "CLO1": "Xác định vấn đề & lập SRS",
        "CLO2": "Thiết kế giải pháp (SDD)",
        "CLO3": "Hiện thực + Kiểm thử",
        "CLO4": "Quản lý dự án",
        "CLO5": "Viết báo cáo",
        "CLO6": "Thuyết trình & Giao tiếp",
        "CLO7": "Thái độ chuyên nghiệp",
    }
    
    ALL_CLOS = ["CLO1", "CLO2", "CLO3", "CLO4", "CLO5", "CLO6", "CLO7"]
    
    def __init__(
        self,
        min_questions_per_clo: int = 1,
        target_questions_per_clo: int = 2,
        question_time_limit: int = 300,  # 5 minutes per question
    ):
        self.min_questions_per_clo = min_questions_per_clo
        self.target_questions_per_clo = target_questions_per_clo
        self.question_time_limit = question_time_limit
    
    # =========================================================================
    # 1. DIFFICULTY ADJUSTMENT
    # =========================================================================
    
    def adjust_difficulty(
        self,
        current_clo: str,
        answer_quality: float,
        consecutive_wrong: int,
        time_remaining: int,
        coverage: Dict[str, Dict],
    ) -> DifficultyAdjustment:
        """
        Determine next difficulty adjustment based on performance.
        
        Args:
            current_clo: Current CLO being tested
            answer_quality: Quality score 0.0-1.0 (from QualitySignals.confidence)
            consecutive_wrong: Number of consecutive wrong answers
            time_remaining: Seconds remaining in session
            coverage: Current CLO coverage dict
            
        Returns:
            DifficultyAdjustment with action and reasoning
        """
        # Rule 1: Excellent answer -> go deeper
        if answer_quality >= 0.8:
            return DifficultyAdjustment(
                action="deeper",
                reason="Câu trả lời xuất sắc, đi sâu vào trade-off/edge cases"
            )
        
        # Rule 2: Good answer -> same level, different angle
        if answer_quality >= 0.5:
            return DifficultyAdjustment(
                action="same",
                reason="Câu trả lời khá, hỏi khía cạnh bổ sung"
            )
        
        # Rule 3: Consecutive wrong answers
        if consecutive_wrong >= 3:
            # Switch CLO after 3 consecutive wrong
            next_clo = self._select_next_clo(coverage)
            return DifficultyAdjustment(
                action="switch_clo",
                target_clo=next_clo,
                reason="3 câu sai liên tiếp, chuyển CLO khác"
            )
        elif consecutive_wrong >= 2:
            return DifficultyAdjustment(
                action="hint",
                hint_level=HintLevel.REPHRASE.value,
                hint_text="Hãy thử tư duy từ góc độ khác...",
                reason="2 câu sai liên tiếp, đưa gợi ý + rephrase"
            )
        elif consecutive_wrong >= 1:
            return DifficultyAdjustment(
                action="hint",
                hint_level=HintLevel.KEYWORD.value,
                hint_text="Gợi ý: hãy nhắc đến từ khóa quan trọng...",
                reason="Câu trả lời chưa chính xác, đưa gợi ý từ khóa"
            )
        
        # Default: same level
        return DifficultyAdjustment(action="same", reason="Tiếp tục cùng level")
    
    def _select_next_clo(self, coverage: Dict[str, Dict]) -> str:
        """Select next CLO based on coverage gaps + weights."""
        # Priority: missing CLOs with high weight
        missing = [clo for clo in self.ALL_CLOS if coverage.get(clo, {}).get("questions_asked", 0) == 0]
        if missing:
            # Return highest weight missing CLO
            return max(missing, key=lambda c: self.CLO_WEIGHTS.get(c, 0))
        
        # All CLOs have at least 1 question, pick by urgency (weight * coverage_gap)
        scored = []
        for clo in self.ALL_CLOS:
            cov = coverage.get(clo, {"questions_asked": 0})
            weight = self.CLO_WEIGHTS.get(clo, 0)
            coverage_ratio = min(cov.get("questions_asked", 0) / 2.0, 1.0)
            urgency = self.CLO_WEIGHTS.get(clo, 0) * (1 - coverage_ratio)
            scored.append((clo, urgency))
        
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[0][0] if scored else "CLO1"
    
    # =========================================================================
    # 2. COVERAGE ENFORCEMENT
    # =========================================================================
    
    def enforce_coverage(
        self,
        covered_clos: Set[str],
        target_clos: Set[str],
        time_remaining: int,
        questions_remaining: int,
        coverage: Dict[str, Dict],
    ) -> CoverageAction:
        """
        Enforce CLO coverage - force switch if needed.
        
        Returns CoverageAction with force_switch flag and priority CLOs.
        """
        target_clos = set(self.ALL_CLOS) if target_clos is None else target_clos
        missing = target_clos - covered_clos
        
        if not missing:
            return CoverageAction(force_switch=False, reason="All CLOs covered")
        
        # Estimate questions possible in remaining time
        estimated_questions = max(1, time_remaining // self.question_time_limit)
        
        # Force switch if missing CLOs > estimated remaining questions
        if len(missing) > estimated_questions:
            # Prioritize missing CLOs by weight
            priority_missing = sorted(missing, key=lambda c: self.CLO_WEIGHTS.get(c, 0), reverse=True)
            return CoverageAction(
                force_switch=True,
                priority_clos=priority_missing[:2],
                reason=f"Thiếu {len(missing)} CLO nhưng chỉ còn {estimated_questions} câu hỏi. Ép switch."
            )
        
        # If time running out (< 10 min) and high-weight CLOs missing
        high_priority_missing = [c for c in missing if self.CLO_WEIGHTS.get(c, 0) > 0.1]
        if high_priority_missing and time_remaining < 600:  # < 10 phút
            return CoverageAction(
                force_switch=True,
                priority_clos=high_priority_missing[:2],
                reason=f"Sắp hết giờ, thiếu CLO trọng số cao: {high_priority_missing}"
            )
        
        return CoverageAction(force_switch=False, reason="Coverage OK")
    
    # =========================================================================
    # 3. HINT SYSTEM
    # =========================================================================
    
    HINT_TEMPLATES = {
        HintLevel.KEYWORD: [
            "Gợi ý: Hãy nhắc đến từ khóa '{keyword}'...",
            "Gợi ý: Hãy nhắc đến khái niệm '{keyword}'...",
        ],
        HintLevel.REPHRASE: [
            "Hãy thử diễn đạt lại câu hỏi từ góc độ khác...",
            "Thử suy nghĩ từ góc độ người dùng/hệ thống...",
        ],
        HintLevel.STEP_BY_STEP: [
            "Hãy chia nhỏ vấn đề: Bước 1..., Bước 2..., Bước 3...",
            "Hãy mô tả luồng dữ liệu từng bước...",
        ],
    }
    
    def generate_hint(
        self,
        hint_level: HintLevel,
        expected_keywords: List[str],
        question: str,
    ) -> str:
        """Generate contextual hint based on level."""
        import random
        
        templates = self.HINT_TEMPLATES.get(hint_level, [])
        if not templates:
            return ""
        
        template = random.choice(templates)
        
        if hint_level == HintLevel.KEYWORD and expected_keywords:
            # Pick a missing keyword (simplified - in reality would track covered)
            keyword = expected_keywords[0] if expected_keywords else "khái niệm chính"
            return template.format(keyword=keyword)
        
        return template


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def create_adaptive_service(
    min_questions_per_clo: int = 1,
    target_questions_per_clo: int = 2,
    question_time_limit: int = 300,
) -> MockAdaptiveService:
    """Factory function to create adaptive service."""
    return MockAdaptiveService(
        min_questions_per_clo=min_questions_per_clo,
        target_questions_per_clo=target_questions_per_clo,
        question_time_limit=question_time_limit,
    )