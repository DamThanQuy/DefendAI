"""
Mock Q&A Engine — Core engine for Mock Room AI Q&A.

Phase 1 + 2 Lite: Core Q&A Engine + Feedback + CLO Tracking + Quality Signals
"""

import logging
import uuid
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict

from app.services.rag_service import RAGService, RAGContext
from app.services.mock_feedback import FeedbackGenerator, FeedbackResult, generate_feedback
from app.services.clo_tracker import CLOTracker
from app.services.quality_signals import QualitySignalsExtractor, QualitySignals
from app.services.mock_adaptive import MockAdaptiveService, DifficultyAdjustment as AdaptiveDifficultyAdjustment, CoverageAction, HintLevel
from app.services.mock_summary import MockSummaryService
from app.services.session_store import get_session_store, close_session_store

logger = logging.getLogger(__name__)


class QASessionState(str, Enum):
    IDLE = "idle"
    QUESTIONING = "questioning"
    EVALUATING = "evaluating"
    FEEDBACK = "feedback"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Question:
    """Generated question for student."""
    question: str
    clo: str
    type: str  # Clarification | Deep-dive | Challenge
    difficulty: str  # Easy | Medium | Hard
    expected_keywords: List[str]
    source_chunks: List[str]


@dataclass
class EvaluationResult:
    """Result of evaluating student answer."""
    feedback: FeedbackResult
    quality_signals: QualitySignals
    clo: str


@dataclass
class DifficultyAdjustment:
    action: str  # deeper | same | hint | switch_clo
    target_clo: Optional[str] = None
    reason: str = ""
    """
    Core engine for Mock Room AI Q&A.
    
    Orchestrates: RAG Retrieval → Question Generation → Answer Evaluation → 
    Feedback → CLO Tracking → Quality Signals → Adaptive Difficulty
    """
    
    # Question type distribution
    QUESTION_TYPES = {
        "Clarification": 0.2,
        "Deep-dive": 0.5,
        "Challenge": 0.3,
    }
    
    # Difficulty progression
    DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"]
    
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
    
    def __init__(
        self,
        meeting_id: int,
        workspace_id: int,
        rag_service: Optional[Any] = None,
        feedback_generator: Optional[Any] = None,
        clo_tracker: Optional[Any] = None,
        quality_extractor: Optional[Any] = None,
        adaptive_service: Optional[Any] = None,
        summary_service: Optional[Any] = None,
        session_store: Optional[Any] = None,
    ):
        self.meeting_id = meeting_id
        self.workspace_id = workspace_id
        
        # State
        self.state = QASessionState.IDLE
        self.current_clo = "CLO1"
        self.questions_asked = 0
        self.max_questions = 10
        self.session_timeout = 1800  # 30 minutes
        self.question_timeout = 300  # 5 minutes per question
        
        # Tracking
        self.history: List[Dict[str, Any]] = []
        self.consecutive_wrong = 0
        self.last_answer_quality: Optional[float] = None
        self.started_at = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        
        # Services (injected or created lazily)
        self._rag_service = rag_service
        self._feedback_generator = feedback_generator
        self._clo_tracker = clo_tracker
        self._quality_extractor = None  # Created lazily
        self._adaptive_service = adaptive_service
        self._summary_service = summary_service
        self._session_store = session_store
        
        # Question type counter for distribution
        self.question_type_counts: Dict[str, int] = defaultdict(int)
    
    @property
    def rag_service(self):
        if self._rag_service is None:
            from app.services.rag_service import RAGService
            self._rag_service = RAGService()
        return self._rag_service
    
    @property
    def feedback_generator(self):
        if self._feedback_generator is None:
            from app.services.mock_feedback import FeedbackGenerator
            self._feedback_generator = FeedbackGenerator()
        return self._feedback_generator
    
    @property
    def clo_tracker(self):
        if self._clo_tracker is None:
            from app.services.clo_tracker import CLOTracker
            self._clo_tracker = CLOTracker()
        return self._clo_tracker
    
    @property
    def quality_extractor(self):
        if self._quality_extractor is None:
            from app.services.quality_signals import QualitySignalsExtractor
            self._quality_extractor = QualitySignalsExtractor()
        return self._quality_extractor
    
    @property
    def adaptive_service(self):
        if self._adaptive_service is None:
            from app.services.mock_adaptive import MockAdaptiveService
            self._adaptive_service = MockAdaptiveService()
        return self._adaptive_service
    
    @property
    def summary_service(self):
        if self._summary_service is None:
            from app.services.mock_summary import MockSummaryService
            self._summary_service = MockSummaryService()
        return self._summary_service
    
    @property
    def session_store(self):
        if self._session_store is None:
            self._session_store = get_session_store()
        return self._session_store
    
    # =========================================================================
    # PUBLIC API
    # =========================================================================
    
    async def start_session(self) -> Question:
        """Start a new Q&A session, return first question."""
        self.state = QASessionState.QUESTIONING
        self.started_at = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        
        # Generate first question (CLO1)
        question = await self._generate_question()
        self.state = QASessionState.QUESTIONING
        return question
    
    async def process_answer(self, answer: str) -> Dict[str, Any]:
        """
        Process student answer: evaluate, generate feedback, track CLO,
        extract quality signals, determine next question.
        
        Returns:
            Dict with feedback, scores, next_question (or done signal)
        """
        if self.state != QASessionState.QUESTIONING:
            return {"error": "Not in questioning state", "state": self.state.value}
        
        self.last_activity = datetime.utcnow()
        
        # Get the current question from history
        if not self.history:
            return {"error": "No active question"}
        
        current_question = self.history[-1]["question"]
        current_clo = self.history[-1]["clo"]
        expected_keywords = self.history[-1].get("expected_keywords", [])
        source_chunks = self.history[-1].get("source_chunks", [])
        
        self.state = QASessionState.EVALUATING
        
        # Get RAG context for evaluation
        rag_context = await self._get_rag_context(
            current_clo, 
            question=current_question,
            answer=answer
        )
        
        # Evaluate answer with feedback generator
        feedback_result = await self.feedback_generator.generate_feedback(
            question=current_question,
            answer=answer,
            context=rag_context.context_text if hasattr(rag_context, 'context_text') else "",
            expected_keywords=expected_keywords,
            clo=current_clo,
        )
        
        # Extract quality signals
        quality_signals = self.quality_extractor.extract(
            answer=answer,
            expected_keywords=expected_keywords,
            feedback_result=feedback_result,
        )
        
        # Determine correctness
        is_correct = feedback_result.is_correct
        is_partial = (feedback_result.quality_signals.accuracy == "partial")
        
        # Update CLO tracker
        self.clo_tracker.record_answer(
            clo=current_clo,
            is_correct=is_correct,
            is_partial=is_partial,
            quality_level=feedback_result.quality_signals.accuracy.value if hasattr(feedback_result.quality_signals, 'accuracy') else "low"
        )
        
        # Update consecutive wrong counter
        if not is_correct:
            self.consecutive_wrong += 1
        else:
            self.consecutive_wrong = 0
        
        # Store quality signals
        self.last_answer_quality = feedback_result.quality_signals.confidence
        
        # Determine next action (adaptive difficulty)
        adjustment = await self._adjust_difficulty()
        
        # Generate next question or complete
        if self.questions_asked >= self.max_questions:
            self.state = QASessionState.COMPLETED
            return {
                "type": "done",
                "feedback": feedback_result.feedback,
                "quality_signals": quality_signals,
                "clo_coverage": self.clo_tracker.get_coverage_summary(),
                "summary": await self._generate_summary(),
            }
        
        # Apply difficulty adjustment
        if adjustment.action == "switch_clo":
            self.current_clo = adjustment.target_clo or self._select_next_clo()
        elif adjustment.action == "hint":
            # Will add hint to next question
            pass
        
        # Generate next question
        next_question = await self._generate_question()
        
        return {
            "type": "feedback",
            "feedback": feedback_result.feedback,
            "is_correct": is_correct,
            "quality_signals": quality_signals.__dict__,
            "clo_coverage": self.clo_tracker.get_coverage_summary(),
            "next_question": next_question.__dict__ if next_question else None,
            "adjustment": adjustment.__dict__ if adjustment else None,
        }
    
    # =========================================================================
    # PRIVATE METHODS
    # =========================================================================
    
    async def _generate_question(self) -> Question:
        """Generate next question based on current CLO and coverage."""
        
        # Get RAG context for current CLO
        rag_context = await self._get_rag_context(
            self.current_clo,
            query=self.CLO_NAMES.get(self.current_clo, "")
        )
        
        # Build prompt for question generation
        prompt = self._build_question_prompt(rag_context)
        
        # Call AI Gateway
        from app.services.ai_client import ai_gateway
        result = await ai_gateway.generate(
            prompt=prompt,
            system_prompt=self.QUESTION_SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=500,
        )
        
        # Parse question
        question_data = self._parse_question_json(result.get("content", ""))
        
        # Track question type distribution
        q_type = question_data.get("type", "Deep-dive")
        self.question_type_counts[q_type] += 1
        
        # Create Question object
        question = Question(
            question=question_data.get("question", ""),
            clo=question_data.get("clo", self.current_clo),
            type=question_data.get("type", "Deep-dive"),
            difficulty=question_data.get("difficulty", "Medium"),
            expected_keywords=question_data.get("expected_keywords", []),
            source_chunks=question_data.get("source_chunks", []),
        )
        
        # Store in history
        self.history.append({
            "question": question.question,
            "clo": question.clo,
            "type": question.type,
            "difficulty": question.difficulty,
            "expected_keywords": question.expected_keywords,
            "source_chunks": question.source_chunks,
            "timestamp": datetime.utcnow().isoformat(),
        })
        
        self.questions_asked += 1
        self.current_clo = question.clo
        
        return question
    
    async def _get_rag_context(self, clo: str, query: str, answer: str = "") -> RAGContext:
        """Get RAG context for a specific CLO."""
        # Use RAG service to retrieve relevant chunks
        user_chunks = await self.rag_service.retrieve_user_docs(
            query=f"{query} {answer}",
            workspace_id=self.workspace_id,
            top_k=8,
        )
        
        ref_chunks = await self.rag_service.retrieve_reference_docs(
            query=query,
            top_k=4,
        )
        
        code_chunks = await self.rag_service.retrieve_code(
            query=query,
            workspace_id=self.workspace_id,
            top_k=3,
        )
        
        return RAGContext(
            query=query,
            user_chunks=user_chunks,
            ref_chunks=ref_chunks,
            code_chunks=code_chunks,
        )
    
    async def _adjust_difficulty(self) -> DifficultyAdjustment:
        """Determine next difficulty adjustment based on performance using Adaptive Service."""
        if not self.history:
            return DifficultyAdjustment(action="same")
        
        # Get last answer quality
        if self.last_answer_quality is None:
            return DifficultyAdjustment(action="same")
        
        quality = self.last_answer_quality
        
        # Get coverage info
        coverage = self.clo_tracker.get_coverage()
        
        # Use adaptive service for difficulty adjustment
        adjustment = await self.adaptive_service.adjust_difficulty(
            current_clo=self.current_clo,
            answer_quality=self.last_answer_quality,
            consecutive_wrong=self.consecutive_wrong,
            time_remaining=self.session_timeout - int((datetime.utcnow() - self.started_at).total_seconds()),
            coverage=self.clo_tracker.get_coverage(),
        )
        
        # Also check coverage enforcement
        coverage_action = self.adaptive_service.enforce_coverage(
            covered_clos=set(k for k, v in self.clo_tracker.get_coverage().items() if v.get("is_covered")),
            time_remaining=self.session_timeout - int((datetime.utcnow() - self.started_at).total_seconds()),
            questions_remaining=self.max_questions - self.questions_asked,
            coverage=self.clo_tracker.get_coverage(),
        )
        
        # If coverage enforcement forces switch, override adjustment
        if coverage_action.force_switch and coverage_action.priority_clos:
            return DifficultyAdjustment(
                action="switch_clo",
                target_clo=coverage_action.priority_clos[0],
                reason=coverage_action.reason
            )
        
        return adjustment
    
    def _select_next_clo(self) -> str:
        """Select next CLO based on coverage gaps and weights."""
        missing = self.clo_tracker.get_missing_clos(min_questions=1)
        if missing:
            return missing[0]
        
        # All CLOs have at least 1 question, prioritize by weight and coverage
        priority = self.clo_tracker.get_priority_clos(top_n=1)
        if priority:
            return priority[0]
        
        # Cycle through CLOs
        try:
            idx = self.CLO_NAMES.keys().index(self.current_clo)
            return list(self.CLO_NAMES.keys())[(idx + 1) % len(self.CLO_NAMES)]
        except (ValueError, AttributeError):
            return "CLO1"
    
    def _build_question_prompt(self, rag_context: RAGContext) -> str:
        """Build prompt for question generation."""
        # Get CLO info
        clo_name = self.CLO_NAMES.get(self.current_clo, self.current_clo)
        oga_weight = self.CLO_WEIGHTS.get(self.current_clo, 0) * 100
        tda_weight = self.CLO_WEIGHTS.get(self.current_clo, 0) * 100
        
        # Get coverage info
        coverage = self.clo_tracker.get_coverage()
        current_coverage = coverage.get(self.current_clo, {})
        
        return f"""Bạn là hội đồng bảo vệ đồ án SEP490.

CONTEXT:
- Current CLO: {self.current_clo} ({clo_name})
- Weight: OGA={oga_weight:.0f}%, TDA={tda_weight:.0f}%
- Coverage so far: {self.clo_tracker.get_coverage_summary()['covered_clos']}/7 CLOs covered
- This CLO asked: {current_coverage.get('questions_asked', 0)} times

DOCUMENT CONTEXT:
{rag_context.to_prompt_context(max_tokens=4000, include_citations=True)}

RULES:
1. Hỏi theo CLO hiện tại ({self.current_clo}: {clo_name})
2. Type: Clarification (20%) / Deep-dive (50%) / Challenge (30%)
3. Difficulty: Easy -> Medium -> Hard (adaptive)
4. Không lặp lại câu hỏi đã hỏi
5. Nếu coverage đủ cho CLO này → tự động switch CLO

Trả về DUY NHẤT 1 JSON:
{{
  "question": "...",
  "clo": "{self.current_clo}",
  "type": "Deep-dive",
  "difficulty": "Medium",
  "expected_keywords": ["kw1", "kw2"],
  "source_chunks": ["chunk_id_1"]
}}"""
    
    def _parse_question_json(self, raw: str) -> dict:
        """Parse JSON from LLM response."""
        import json
        text = raw.strip()
        if text.startswith("```"):
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end >= start:
                text = text[start:end+1]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse question JSON: {raw[:200]}")
            return {"question": "Câu hỏi mặc định", "clo": self.current_clo, "type": "Deep-dive", "difficulty": "Medium", "expected_keywords": [], "source_chunks": []}
    
    async def _generate_summary(self) -> Dict[str, Any]:
        """Generate session summary report using MockSummaryService."""
        return await self.summary_service.generate_summary(
            meeting_id=self.meeting_id,
            workspace_id=self.workspace_id,
            student_id=0,  # TODO: get actual student_id from meeting
            clo_tracker=self.clo_tracker,
            question_log=self.history,
            session_duration_minutes=int((datetime.utcnow() - self.started_at).total_seconds() / 60),
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize session for persistence."""
        return {
            "meeting_id": self.meeting_id,
            "workspace_id": self.workspace_id,
            "state": self.state.value,
            "current_clo": self.current_clo,
            "questions_asked": self.questions_asked,
            "max_questions": self.max_questions,
            "consecutive_wrong": self.consecutive_wrong,
            "last_answer_quality": self.last_answer_quality,
            "question_type_counts": dict(self.question_type_counts),
            "clo_tracker": self.clo_tracker.to_dict(),
            "started_at": self.started_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MockQAEngine":
        """Deserialize session."""
        engine = cls(
            meeting_id=data["meeting_id"],
            workspace_id=data["workspace_id"],
        )
        engine.state = QASessionState(data["state"])
        engine.current_clo = data["current_clo"]
        engine.questions_asked = data["questions_asked"]
        engine.max_questions = data.get("max_questions", 10)
        engine.consecutive_wrong = data.get("consecutive_wrong", 0)
        engine.last_answer_quality = data.get("last_answer_quality")
        engine.started_at = datetime.fromisoformat(data["started_at"])
        engine.last_activity = datetime.fromisoformat(data["last_activity"])
        engine.question_type_counts = defaultdict(int, data.get("question_type_counts", {}))
        engine.clo_tracker = CLOTracker.from_dict(data["clo_tracker"])
        return engine


# Convenience function
async def create_mock_qa_session(
    meeting_id: int,
    workspace_id: int,
) -> MockQAEngine:
    """Factory function to create MockQAEngine."""
    return MockQAEngine(meeting_id=meeting_id, workspace_id=workspace_id)


__all__ = [
    "MockQAEngine",
    "QASessionState",
    "Question",
    "EvaluationResult",
    "DifficultyAdjustment",
    "create_mock_qa_session",
]