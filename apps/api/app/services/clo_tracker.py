"""
CLO Tracker Service — Track CLO coverage without numerical scores.

Phase 2 Lite: CLO Tracking + Quality Signals
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set
from collections import defaultdict
from enum import Enum
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class AnswerQualityLevel(str, Enum):
    """Quality level of answer per CLO."""
    HIGH = "high"      # Correct, deep
    MEDIUM = "medium"  # Partial, medium depth
    LOW = "low"        # Incorrect, shallow


@dataclass
class CLOCoverage:
    """Coverage stats for a single CLO."""
    clo: str
    correct_count: int = 0
    partial_count: int = 0
    incorrect_count: int = 0
    quality_levels: Dict[str, int] = field(default_factory=lambda: {
        "high": 0,
        "medium": 0,
        "low": 0,
    })
    last_asked_at: Optional[str] = None
    questions_asked: int = 0
    accuracy_rate: float = 0.0
    is_covered: bool = False

    def _recalc(self):
        self.questions_asked = self.correct_count + self.partial_count + self.incorrect_count
        if self.questions_asked > 0:
            self.accuracy_rate = self.correct_count / self.questions_asked
        else:
            self.accuracy_rate = 0.0
        self.is_covered = self.correct_count >= 1 or self.partial_count >= 2

    def record_correct(self):
        self.correct_count += 1
        self._recalc()

    def record_partial(self):
        self.partial_count += 1
        self._recalc()

    def record_incorrect(self):
        self.incorrect_count += 1
        self._recalc()


class CLOTracker:
    """
    Track CLO coverage across a Mock Room session.

    Tracks which CLOs have been asked, how well student answered,
    and provides coverage metrics for Phase 3 Adaptive.
    """

    # All 7 CLOs from SEP490 rubric
    ALL_CLOS = [
        "CLO1", "CLO2", "CLO3", "CLO4", "CLO5", "CLO6", "CLO7"
    ]

    CLO_NAMES = {
        "CLO1": "Xác định vấn đề & lập SRS",
        "CLO2": "Thiết kế giải pháp (SDD)",
        "CLO3": "Hiện thực + Kiểm thử",
        "CLO4": "Quản lý dự án",
        "CLO5": "Viết báo cáo",
        "CLO6": "Thuyết trình & Giao tiếp",
        "CLO7": "Thái độ chuyên nghiệp",
    }

    # CLO weights from rubric (OGA + TDA combined)
    CLO_WEIGHTS = {
        "CLO1": 0.155,  # SRS: 16+15=31%
        "CLO2": 0.14,   # SDD: 18+10=28%
        "CLO3": 0.335,  # Impl+Testing: 32+35=67% -> 33.5%
        "CLO4": 0.065,  # PMP: 8+5=13%
        "CLO5": 0.045,  # User Guides: 4+5=9%
        "CLO6": 0.075,  # Presentation+QA: 5+10=15%
        "CLO7": 0.185,  # Attitude: special
    }

    def __init__(self):
        self.coverage: Dict[str, CLOCoverage] = {}
        self._initialize_coverage()

    def _initialize_coverage(self):
        """Initialize coverage for all CLOs."""
        for clo in self.ALL_CLOS:
            self.coverage[clo] = CLOCoverage(clo=clo)

    def record_answer(
        self,
        clo: str,
        is_correct: bool,
        is_partial: bool = False,
        quality_level: str = "low",
    ) -> None:
        """Record a student answer for a CLO."""
        if clo not in self.coverage:
            self.coverage[clo] = CLOCoverage(clo=clo)

        coverage = self.coverage[clo]
        coverage.last_asked_at = datetime.utcnow().isoformat()

        if is_correct:
            coverage.correct_count += 1
            coverage.quality_levels["high"] += 1
        elif is_partial:
            coverage.partial_count += 1
            coverage.quality_levels["medium"] += 1
        else:
            coverage.incorrect_count += 1
            coverage.quality_levels["low"] += 1

        # Recalculate derived fields
        coverage.questions_asked = coverage.correct_count + coverage.partial_count + coverage.incorrect_count
        if coverage.questions_asked > 0:
            coverage.accuracy_rate = coverage.correct_count / coverage.questions_asked
        else:
            coverage.accuracy_rate = 0.0
        coverage.is_covered = coverage.correct_count >= 1 or coverage.partial_count >= 2

    def get_coverage(self) -> Dict[str, Dict]:
        """Get coverage stats for all CLOs."""
        result = {}
        for clo in self.ALL_CLOS:
            cov = self.coverage.get(clo, CLOCoverage(clo=clo))
            result[clo] = {
                "clo": clo,
                "name": self.CLO_NAMES.get(clo, clo),
                "weight": self.CLO_WEIGHTS.get(clo, 0),
                "questions_asked": cov.questions_asked,
                "correct_count": cov.correct_count,
                "partial_count": cov.partial_count,
                "incorrect_count": cov.incorrect_count,
                "accuracy_rate": round(cov.accuracy_rate, 2),
                "is_covered": cov.is_covered,
                "quality_distribution": cov.quality_levels.copy(),
                "last_asked_at": cov.last_asked_at,
            }
        return result

    def get_coverage_summary(self) -> Dict:
        """Get summary stats."""
        covered = sum(1 for clo in self.ALL_CLOS if self.coverage[clo].is_covered)
        total_questions = sum(c.questions_asked for c in self.coverage.values())
        total_correct = sum(c.correct_count for c in self.coverage.values())

        return {
            "total_clos": len(self.ALL_CLOS),
            "covered_clos": covered,
            "coverage_percent": round(covered / len(self.ALL_CLOS) * 100, 1),
            "total_questions": sum(c.questions_asked for c in self.coverage.values()),
            "total_correct": total_correct,
            "overall_accuracy": round(total_correct / max(sum(c.questions_asked for c in self.coverage.values()), 1), 2),
        }

    def get_missing_clos(self, min_questions: int = 1) -> List[str]:
        """Get CLOs not yet covered (less than min_questions asked)."""
        missing = []
        for clo in self.ALL_CLOS:
            cov = self.coverage.get(clo, CLOCoverage(clo=clo))
            if cov.questions_asked < min_questions:
                missing.append(clo)
        # Sort by weight (high priority first)
        missing.sort(key=lambda c: self.CLO_WEIGHTS.get(c, 0), reverse=True)
        return missing

    def get_priority_clos(self, top_n: int = 3) -> List[str]:
        """Get priority CLOs to ask next (high weight, low coverage)."""
        scored = []
        for clo in self.ALL_CLOS:
            cov = self.coverage.get(clo, CLOCoverage(clo=clo))
            weight = self.CLO_WEIGHTS.get(clo, 0)
            coverage_ratio = min(cov.questions_asked / 2.0, 1.0)  # target 2 questions per CLO
            urgency = weight * (1 - coverage_ratio)
            scored.append((clo, urgency))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [clo for clo, _ in scored[:top_n]]

    def get_next_clo(self, current_clo: str) -> str:
        """Determine next CLO to ask based on coverage gaps."""
        missing = self.get_missing_clos(min_questions=1)
        if missing:
            return missing[0]

        # All CLOs have at least 1 question, check for low coverage
        priority = self.get_priority_clos(top_n=1)
        if priority and priority[0] != current_clo:
            return priority[0]

        # Cycle through CLOs
        try:
            idx = self.ALL_CLOS.index(current_clo)
            return self.ALL_CLOS[(idx + 1) % len(self.ALL_CLOS)]
        except ValueError:
            return "CLO1"

    def to_dict(self) -> Dict:
        """Serialize tracker state."""
        return {
            "coverage": {
                clo: {
                    "questions_asked": cov.questions_asked,
                    "correct_count": cov.correct_count,
                    "partial_count": cov.partial_count,
                    "incorrect_count": cov.incorrect_count,
                    "quality_levels": cov.quality_levels,
                    "last_asked_at": cov.last_asked_at,
                }
                for clo, cov in self.coverage.items()
            }
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "CLOTracker":
        """Deserialize tracker state."""
        tracker = cls()
        for clo, cov_data in data.get("coverage", {}).items():
            if clo in tracker.coverage:
                cov = tracker.coverage[clo]
                cov.questions_asked = cov_data.get("questions_asked", 0)
                cov.correct_count = cov_data.get("correct_count", 0)
                cov.partial_count = cov_data.get("partial_count", 0)
                cov.incorrect_count = cov_data.get("incorrect_count", 0)
                cov.quality_levels = cov_data.get("quality_levels", {
                    "high": 0, "medium": 0, "low": 0
                })
                cov.last_asked_at = cov_data.get("last_asked_at")
        return tracker