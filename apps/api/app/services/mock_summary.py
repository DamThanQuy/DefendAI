"""
Mock Summary Service — Generate session summary report.

Phase 3: Summary Report Generator.
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime
from collections import defaultdict

from app.services.clo_tracker import CLOTracker
from app.services.quality_signals import QualitySignals

logger = logging.getLogger(__name__)


@dataclass
class QuestionLog:
    """Log entry for a single question."""
    question: str
    clo: str
    type: str
    difficulty: str
    feedback: str
    is_correct: bool
    quality_signals: Dict[str, Any]
    timestamp: str


@dataclass
class SessionSummary:
    """Complete session summary report."""
    session_id: str
    workspace_id: int
    meeting_id: int
    student_id: int

    duration_minutes: int
    total_questions: int

    # CLO Coverage
    clo_coverage: Dict[str, int]  # CLO -> question count
    clo_breakdown: Dict[str, Dict]  # Per-CLO breakdown

    # Scores
    oga_final: float
    tda_final: float

    # Qualitative
    strengths: List[str]
    weaknesses: List[str]
    action_items: List[str]

    # Detailed log
    question_log: List[QuestionLog]


class MockSummaryService:
    """
    Generate session summary report after Mock Room session.
    """

    # CLO weights from rubric
    CLO_WEIGHTS = {
        "CLO1": 0.155,  # SRS
        "CLO2": 0.14,   # SDD
        "CLO3": 0.335,  # Impl + Testing
        "CLO4": 0.065,  # PMP
        "CLO5": 0.045,  # User Guides
        "CLO6": 0.075,  # Presentation + QA
        "CLO7": 0.185,  # Attitude
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

    # OGA/TDA weights per CLO
    CLO_OGA_WEIGHTS = {
        "CLO1": 0.04,  # intro
        "CLO2": 0.16,  # pmp
        "CLO3": 0.16,  # srs
        "CLO4": 0.18,  # sdd
        "CLO5": 0.18,  # testing
        "CLO6": 0.04,  # user_guides
        "CLO7": 0.32,  # implementation
    }

    CLO_TDA_WEIGHTS = {
        "CLO1": 0.05,  # intro
        "CLO2": 0.05,  # pmp
        "CLO3": 0.15,  # srs
        "CLO4": 0.10,  # sdd
        "CLO5": 0.10,  # testing
        "CLO5_guides": 0.05,  # user_guides
        "CLO6": 0.35,  # implementation
        "CLO6_presentation": 0.05,
        "CLO6_qa": 0.10,
    }

    def __init__(self):
        pass

    async def generate_summary(
        self,
        meeting_id: int,
        workspace_id: int,
        student_id: int,
        clo_tracker: Any,
        question_log: List[Dict[str, Any]],
        session_duration_minutes: int,
    ) -> Dict[str, Any]:
        """
        Generate comprehensive session summary.

        Args:
            meeting_id: Meeting ID
            workspace_id: Workspace ID
            student_id: Student ID
            clo_tracker: CLOTracker instance
            question_log: List of question/answer logs
            session_duration_minutes: Session duration in minutes

        Returns:
            Complete session summary dict
        """
        # 1. CLO Coverage Analysis
        coverage = clo_tracker.get_coverage()
        clo_coverage = {}
        clo_breakdown = {}

        for clo in clo_tracker.ALL_CLOS:
            cov = coverage.get(clo, {})
            clo_coverage[clo] = cov.get("questions_asked", 0)

            # Per-CLO breakdown
            clo_data = {
                "name": clo_tracker.CLO_NAMES.get(clo, clo),
                "weight": cov.get("weight", 0),
                "questions": cov.get("questions_asked", 0),
                "correct": cov.get("correct_count", 0),
                "partial": cov.get("partial_count", 0),
                "incorrect": cov.get("incorrect_count", 0),
                "accuracy": cov.get("accuracy_rate", 0),
                "quality": cov.get("quality_distribution", {}),
            }
            clo_breakdown[clo] = clo_data

        # 2. Calculate OGA/TDA scores
        oga_final, tda_final = self._calculate_scores(coverage)

        # 3. Identify strengths/weaknesses
        strengths, weaknesses, action_items = self._analyze_strengths_weaknesses(coverage)

        # 4. Format question log
        question_log_formatted = []
        for entry in question_log:
            question_log_formatted.append({
                "question": entry.get("question", ""),
                "clo": entry.get("clo", ""),
                "type": entry.get("type", ""),
                "difficulty": entry.get("difficulty", ""),
                "feedback": entry.get("feedback", ""),
                "is_correct": entry.get("is_correct", False),
                "quality": entry.get("quality_signals", {}),
                "timestamp": entry.get("timestamp", ""),
            })

        # 5. Build summary
        duration = session_duration_minutes

        summary = {
            "session_id": f"mock_{meeting_id}",
            "workspace_id": workspace_id,
            "meeting_id": meeting_id,
            "student_id": student_id,
            "duration_minutes": duration,
            "total_questions": len(question_log_formatted),
            "clo_coverage": clo_coverage,
            "clo_breakdown": clo_breakdown,
            "oga_final": oga_final,
            "tda_final": tda_final,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "action_items": action_items,
            "question_log": question_log_formatted,
            "timestamp": datetime.utcnow().isoformat(),
        }

        return summary

    def _calculate_scores(self, coverage: Dict) -> tuple[float, float]:
        """Calculate OGA and TDA final scores."""
        oga_total = 0.0
        tda_total = 0.0

        for clo in coverage:
            cov = coverage.get(clo, {})
            accuracy = cov.get("accuracy_rate", 0)

            oga_weight = self.CLO_OGA_WEIGHTS.get(clo, 0)
            tda_weight = self.CLO_TDA_WEIGHTS.get(clo, 0)

            oga_total += accuracy * oga_weight * 10
            tda_total += accuracy * tda_weight * 10

        return round(oga_total, 1), round(tda_total, 1)

    def _analyze_strengths_weaknesses(self, coverage: Dict) -> tuple[list, list, list]:
        """Analyze CLO performance to generate strengths/weaknesses/action_items."""
        strengths = []
        weaknesses = []
        action_items = []

        for clo in coverage:
            cov = coverage.get(clo)
            if not cov or cov.get("questions_asked", 0) == 0:
                continue

            accuracy = cov.get("accuracy_rate", 0)
            clo_name = self.CLO_NAMES.get(clo, clo)

            if cov.get("correct_count", 0) > cov.get("incorrect_count", 0):
                strengths.append(f"{clo_name} ({clo}): {cov['correct_count']}/{cov['questions_asked']} đúng")
            elif cov.get("incorrect_count", 0) > cov.get("correct_count", 0):
                weaknesses.append(f"{clo_name} ({clo}): {cov['incorrect_count']}/{cov['questions_asked']} sai")
                # Generate action item
                action = self._generate_action_item(clo)
                action_items.append(action)

        return strengths, weaknesses, action_items

    def _generate_action_item(self, clo: str) -> str:
        """Generate action item for weak CLO."""
        action_map = {
            "CLO1": "Ôn lại SRS: Use cases, Functional requirements, Business rules",
            "CLO2": "Ôn lại SDD: Architecture, API design, Database design, Design patterns",
            "CLO3": "Ôn lại Implementation + Testing: Code quality, Unit/Integration test, CI/CD",
            "CLO4": "Ôn lại PMP: WBS, Risk management, Schedule, Resource allocation",
            "CLO5": "Ôn lại User Guides: Installation, User manual, Admin guide, Troubleshooting",
            "CLO6": "Luyện tập Presentation: Cấu trúc bài thuyết trình, Demo flow, Q&A handling",
            "CLO7": "Cải thiện Attitude: Professional communication, Honesty, Learning attitude",
        }
        return action_map.get(clo, f"Ôn lại {clo}")
