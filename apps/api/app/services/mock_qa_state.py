"""
State Machine cho Mock Room AI Q&A Session.

Quản lý vòng đời phiên Q&A: idle -> questioning -> evaluating -> feedback -> completed
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from collections import defaultdict
from enum import Enum

from app.core.config import settings
from app.prompts.mock_qa import (
    get_next_clo,
    get_clo_weight_oga,
    get_clo_weight_tda,
    CLO_PRIORITY,
    CLO_NAMES,
)

logger = logging.getLogger(__name__)


class SessionState(str, Enum):
    IDLE = "idle"
    QUESTIONING = "questioning"
    EVALUATING = "evaluating"
    FEEDBACK = "feedback"
    COMPLETED = "completed"
    FAILED = "failed"


class DifficultyAction(str, Enum):
    DEEPER = "deeper"
    SAME = "same"
    HINT = "hint"
    SWITCH_CLO = "switch_clo"


@dataclass
class DifficultyAdjustment:
    action: str  # "deeper" | "same" | "hint" | "switch_clo"
    target_clo: Optional[str] = None
    reason: str = ""


@dataclass
class CoverageAction:
    force_switch: bool
    priority_clos: List[str] = field(default_factory=list)
    reason: str = ""


@dataclass
class QuestionLog:
    question_id: str
    clo: str
    question: str
    answer: str
    answer_quality: float
    question_type: str
    difficulty: str
    timestamp: str


@dataclass
class MockQASession:
    """State Machine cho một phiên Mock Q&A."""
    
    meeting_id: int
    workspace_id: int
    session_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    state: SessionState = SessionState.IDLE
    current_clo: str = "CLO1"
    coverage: Dict[str, int] = field(default_factory=lambda: defaultdict(int))
    history: List[QuestionLog] = field(default_factory=list)
    questions_asked: int = 0
    consecutive_wrong: int = 0
    last_answer_quality: Optional[float] = None
    current_question: Optional[str] = None
    current_question_meta: Optional[Dict[str, Any]] = None
    started_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    session_timeout: int = 1800  # 30 minutes
    question_timeout: int = 300  # 5 minutes per question
    max_questions: int = 10

    # Current question tracking
    current_question_id: Optional[str] = None
    current_question_text: Optional[str] = None
    current_question_meta: Optional[Dict[str, Any]] = None
    question_start_time: Optional[datetime] = None
    
    # Coverage enforcement
    min_clo_coverage: int = 5  # Minimum CLOs to cover
    target_questions_per_clo: int = 2


class ScoreAggregator:
    """Tính toán điểm OGA/TDA real-time (ĐÃ LOẠI BỎ - giữ lại để tương thích cũ)."""
    pass

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ScoreAggregator":
        agg = cls()
        return agg


class MockQASessionManager:
    """Quản lý các phiên Q&A (in-memory, có thể mở rộng Redis)."""
    
    def __init__(self):
        self.sessions: Dict[str, MockQASession] = {}
        self._lock = asyncio.Lock()
    
    async def create_session(
        self,
        meeting_id: int,
        workspace_id: int,
        session_timeout: int = 1800,
        max_questions: int = 10,
    ) -> MockQASession:
        async with self._lock:
            session = MockQASession(
                meeting_id=meeting_id,
                workspace_id=workspace_id,
                session_timeout=session_timeout,
                max_questions=max_questions,
            )
            self.sessions[session.session_id] = session
            logger.info(f"Created QA session {session.session_id} for meeting {meeting_id}")
            return session
    
    async def get_session(self, session_id: str) -> Optional[MockQASession]:
        async with self._lock:
            session = self.sessions.get(session_id)
            if session:
                session.last_activity = datetime.utcnow()
            return session
    
    async def update_session(self, session: MockQASession):
        async with self._lock:
            session.last_activity = datetime.utcnow()
            self.sessions[session.session_id] = session
    
    async def delete_session(self, session_id: str):
        async with self._lock:
            self.sessions.pop(session_id, None)
    
    async def cleanup_stale_sessions(self, max_age_minutes: int = 60):
        """Dọn dẹp các session cũ không hoạt động."""
        cutoff = datetime.utcnow() - timedelta(minutes=max_age_minutes)
        async with self._lock:
            stale_ids = [
                sid for sid, session in self.sessions.items()
                if session.last_activity < cutoff
            ]
            for sid in stale_ids:
                del self.sessions[sid]
            if stale_ids:
                logger.info(f"Cleaned up {len(stale_ids)} stale QA sessions")


# Singleton instance
_session_manager: Optional[MockQASessionManager] = None


def get_session_manager() -> MockQASessionManager:
    global _session_manager
    if _session_manager is None:
        _session_manager = MockQASessionManager()
    return _session_manager


# ============================================================================
# State Transition Logic
# ============================================================================

VALID_TRANSITIONS = {
    SessionState.IDLE: [SessionState.QUESTIONING],
    SessionState.QUESTIONING: [SessionState.EVALUATING, SessionState.FAILED],
    SessionState.EVALUATING: [SessionState.FEEDBACK],
    SessionState.FEEDBACK: [SessionState.QUESTIONING, SessionState.COMPLETED],
    SessionState.COMPLETED: [],
    SessionState.FAILED: [],
}


def can_transition(from_state: SessionState, to_state: SessionState) -> bool:
    return to_state in VALID_TRANSITIONS.get(from_state, [])


def transition_state(session: MockQASession, new_state: SessionState) -> bool:
    """Thực hiện chuyển state, trả về True nếu thành công."""
    if not can_transition(session.state, new_state):
        logger.warning(
            f"Invalid state transition: {session.state} -> {new_state} "
            f"for session {session.session_id}"
        )
        return False
    
    session.state = new_state
    session.last_activity = datetime.utcnow()
    return True


# ============================================================================
# Difficulty Adjustment Logic
# ============================================================================

def adjust_difficulty(
    current_clo: str,
    answer_quality: float,
    consecutive_wrong: int,
    time_remaining: int,
    coverage: Dict[str, int],
) -> DifficultyAdjustment:
    """
    Điều chỉnh độ khó dựa trên quality câu trả lời.
    
    Returns DifficultyAdjustment với action: deeper/same/hint/switch_clo
    """
    
    # Rule 1: Answer quality >= 0.8 -> deeper follow-up
    if answer_quality >= 0.8:
        return DifficultyAdjustment(
            action=DifficultyAction.DEEPER,
            reason="Câu trả lời xuất sắc, đi sâu vào trade-off/edge cases"
        )
    
    # Rule 2: Answer quality >= 0.5 -> same level, khác khía cạnh
    if answer_quality >= 0.5:
        return DifficultyAdjustment(
            action=DifficultyAction.SAME,
            reason="Câu trả lời khá, hỏi khía cạnh bổ sung"
        )
    
    # Rule 3: Consecutive wrong >= 3 -> switch CLO
    if consecutive_wrong >= 3:
        target = get_next_clo(consecutive_wrong=consecutive_wrong, coverage=coverage)
        return DifficultyAdjustment(
            action=DifficultyAction.SWITCH_CLO,
            target_clo=target,
            reason=f"{consecutive_wrong} câu sai liên tiếp, chuyển sang {CLO_NAMES.get(target, target)}"
        )
    
    # Rule 4: Consecutive wrong == 2 -> hint + rephrase
    if consecutive_wrong >= 2:
        return DifficultyAdjustment(
            action=DifficultyAction.HINT,
            reason=f"{consecutive_wrong} câu sai liên tiếp, đưa gợi ý + rephrase"
        )
    
    # Rule 5: Sai 1 lần -> hint nhẹ
    if consecutive_wrong == 1:
        return DifficultyAdjustment(
            action=DifficultyAction.HINT,
            reason="Câu trả lời chưa chính xác, đưa gợi ý từ khóa"
        )
    
    return DifficultyAdjustment(action=DifficultyAction.SAME, reason="Tiếp tục cùng level")


def enforce_coverage(
    covered_clos: Dict[str, int],
    time_remaining: int,
    min_coverage: int = 5,
) -> CoverageAction:
    """
    Kiểm tra và enforce coverage CLO.
    
    Returns CoverageAction: force_switch nếu cần.
    """
    target_clos = set(CLO_NAMES.keys())
    covered = {clo for clo, count in covered_clos.items() if count > 0}
    missing = target_clos - covered
    
    if not missing:
        return CoverageAction(force_switch=False, reason="All CLOs covered")
    
    # Ước tính số câu hỏi còn có thể hỏi
    # Trung bình ~3 phút/câu = 180s
    estimated_questions = max(1, time_remaining // 180)
    
    # Nếu CLO còn thiếu > số câu có thể hỏi -> force switch
    if len(missing) > estimated_questions:
        priority_missing = sorted(
            missing, 
            key=lambda c: CLO_PRIORITY.get(c, 0), 
            reverse=True
        )
        return CoverageAction(
            force_switch=True,
            priority_clos=priority_missing[:2],
            reason=f"Thiếu {len(missing)} CLO nhưng chỉ còn {estimated_questions} câu hỏi. Force switch."
        )
    
    # Sắp hết giờ (< 10 phút) mà vẫn thiếu CLO trọng số cao
    high_priority_missing = [c for c in missing if CLO_PRIORITY.get(c, 0) > 0.1]
    if high_priority_missing and time_remaining < 600:  # < 10 phút
        return CoverageAction(
            force_switch=True,
            priority_clos=high_priority_missing[:2],
            reason=f"Sắp hết giờ, thiếu CLO trọng số cao: {high_priority_missing}"
        )
    
    return CoverageAction(force_switch=False, reason="Coverage OK")


# ============================================================================
# Coverage Enforcement
# ============================================================================

def check_coverage_enforcement(
    coverage: Dict[str, int],
    time_remaining: int,
    questions_asked: int,
    max_questions: int = 10,
) -> CoverageAction:
    """
    Kiểm tra và enforce coverage CLO trong session.
    """
    return enforce_coverage(
        covered_clos=coverage,
        time_remaining=time_remaining,
        min_coverage=5,
    )