"""
AI Q&A Engine cho Mock Room.

Core engine điều phối: State Machine + RAG + Grading + Prompt Engineering.
"""

import logging
import uuid
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from app.core.config import settings
from app.services.ai_client import ai_gateway
from app.services.mock_qa_state import (
    MockQASession,
    SessionState,
    DifficultyAdjustment,
    CoverageAction,
    DifficultyAction,
    adjust_difficulty,
    enforce_coverage,
    get_next_clo,
    ScoreAggregator,
)
from app.services.mock_qa_rag import MockQARAGService
from app.prompts.mock_qa import (
    QUESTION_GEN_SYSTEM_PROMPT,
    QUESTION_GEN_USER_PROMPT,
    EVALUATION_SYSTEM_PROMPT,
    EVALUATION_USER_PROMPT,
    DIFFICULTY_ADJUSTMENT_PROMPT,
    HINT_GENERATION_PROMPT,
    SUMMARY_REPORT_PROMPT,
    get_clo_weight_oga,
    get_clo_weight_tda,
    format_coverage,
    CLO_NAMES,
)
from app.services.rag_service import RAGService

logger = logging.getLogger(__name__)


@dataclass
class Question:
    """Câu hỏi được generate."""
    question_id: str
    clo: str
    question: str
    question_type: str
    difficulty: str
    expected_keywords: List[str]
    source_chunks: List[str]
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class EvaluationResult:
    """Kết quả đánh giá câu trả lời."""
    oga_score: float
    tda_score: float
    feedback: str
    quality_criteria_met: List[str]
    confidence: float
    answer_quality: float


@dataclass
class Hint:
    hint: str
    level: int  # 1=keyword, 2=rephrase, 3=step-by-step


class MockQAEngine:
    """
    Core AI Engine cho Mock Room Q&A.
    
    Điều phối: State Machine + RAG Retrieval + Grading + Prompt Engineering
    """
    
    def __init__(
        self,
        rag_service,
        config: Dict[str, Any] = None,
    ):
        self.config = {
            "max_questions": settings.mock_qa_max_questions if hasattr(settings, 'mock_qa_max_questions') else 10,
            "session_timeout": settings.mock_qa_session_timeout if hasattr(settings, 'mock_qa_session_timeout') else 1800,
            "question_timeout": settings.mock_qa_question_timeout if hasattr(settings, 'mock_qa_question_timeout') else 300,
            "provider": getattr(settings, 'mock_qa_provider', 'openai'),
            "model": getattr(settings, 'mock_qa_model', 'gpt-4o-mini'),
            "temperature": getattr(settings, 'mock_qa_temperature', 0.3),
        }
        self.config.update(config or {})
        
        # Initialize services
        self.rag = rag_service
        self.rag_qa = MockQARAGService(rag_service)
        
        logger.info(f"MockQAEngine initialized with config: {self.config}")
    
    async def start_session(
        self,
        meeting_id: int,
        workspace_id: int,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Khởi tạo phiên Q&A mới.
        
        Returns:
            Dict với session info và câu hỏi đầu tiên.
        """
        from app.services.mock_qa_state import MockQASession, SessionState
        
        session = MockQASession(
            meeting_id=meeting_id,
        
        # Generate first question
        first_question = await self.generate_question(session)
        
        return {
            "session_id": session.session_id,
            "state": "questioning",
            "question": first_question,
            "clo": "CLO1",
            "coverage": {},
            "questions_asked": 0,
        }
    
    async def process_answer(
        self,
        session: Dict[str, Any],
        answer: str,
        workspace_id: int,
    ) -> Dict[str, Any]:
        """
        Xử lý câu trả lời của sinh viên.
        
        Flow:
        1. Evaluate answer -> score + feedback
        2. Update session state (scores, coverage, consecutive_wrong)
        3. Determine difficulty adjustment
        4. Check coverage enforcement
        4. Generate next question OR complete session
        
        Returns:
            Dict với feedback, scores, next_question (hoặc summary nếu done)
        """
        # This would integrate with the full flow
        pass
    
    async def generate_question(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate câu hỏi tiếp theo dựa trên session state.
        
        Steps:
        1. Get RAG context for current CLO
        2. Build prompt with context + history
        3. Call AI Gateway
        4. Parse & validate response
        4. Update session state
        """
        pass
    
    async def evaluate_answer(
        self,
        session: Dict[str, Any],
        answer: str,
        workspace_id: int,
    ) -> Dict[str, Any]:
        """
        Đánh giá câu trả lời của sinh viên.
        
        Returns:
            Dict với oga_score, tda_score, feedback, quality_criteria_met, confidence
        """
        pass
    
    async def generate_hint(
        self,
        session: Dict[str, Any],
        hint_level: int = 1,
    ) -> Dict[str, Any]:
        """
        Tạo hint cho sinh viên khi bị kẹt.
        hint_level: 1=keyword, 2=rephrase, 3=step-by-step
        """
        pass
    
    async def generate_summary_report(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """Tạo báo cáo tổng kết phiên."""
        pass


# ============================================================================
# Helper functions
# ============================================================================

async def call_ai_gateway(
    prompt: str,
    system_prompt: str,
    temperature: float = 0.3,
    max_tokens: int = 4000,
    response_format: str = "json",
) -> Dict[str, Any]:
    """Call AI Gateway để generate response."""
    from app.services.ai_client import ai_gateway
    
    result = await ai_gateway.generate(
        prompt=prompt,
        system_prompt=system_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    
    content = result.get("content", "")
    
    # Parse JSON if expected
    import json
    try:
        # Extract JSON from response
        text = content.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            start = next(i for i, l in enumerate(lines) if l.strip().startswith("```"))
            end = next(i for i, l in enumerate(lines[start+1:], start+1) if l.strip().startswith("```"))
            text = "\n".join(lines[start+1:end])
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        raise ValueError(f"AI returned invalid JSON: {content[:500]}")


async def generate_question(
    session_state: Dict,
    rag_context: Dict,
    config: Dict,
) -> Dict[str, Any]:
    """
    Generate câu hỏi tiếp theo.
    
    Args:
        session_state: Dict chứa current_clo, coverage, history, etc.
        rag_context: Dict với user_chunks, ref_chunks, code_chunks
        config: Dict với provider, model, temperature, max_tokens
    
    Returns:
        Dict với question, clo, type, difficulty, expected_keywords
    """
    # Build prompt
    current_clo = session_state.get("current_clo", "CLO1")
    coverage = session_state.get("coverage", {})
    history = session_state.get("history", [])
    
    prompt = QUESTION_GEN_USER_PROMPT.format(
        current_clo=session_state.get("current_clo", "CLO1"),
        oga_weight=get_clo_weight_oga(session_state.get("current_clo", "CLO1")),
        tda_weight=get_clo_weight_tda(session_state.get("current_clo", "CLO1")),
        coverage=format_coverage(session_state.get("coverage", {})),
        rag_context=build_context_prompt(rag_context),
        code_context="",  # TODO: add code context
        history=format_history(history),
    )
    
    # Call AI
    result = await call_ai_gateway(
        prompt=prompt,
        system_prompt=QUESTION_GEN_SYSTEM_PROMPT,
        temperature=0.3,
        max_tokens=500,
    )
    
    return result


def format_history(history: List[Dict]) -> str:
    """Format history cho prompt."""
    if not history:
        return "Chưa có lịch sử Q&A."
    
    parts = []
    for i, entry in enumerate(history[-5:], 1):  # Last 5
        parts.append(f"Q{i}: {entry.get('question', '')}")
        parts.append(f"A{i}: {entry.get('answer', '')[:200]}")
    return "\n".join(parts)


def format_coverage(coverage: Dict[str, int]) -> str:
    """Format coverage info cho prompt."""
    if not coverage:
        return "Chưa có câu hỏi nào."
    
    parts = []
    for clo, count in coverage.items():
        parts.append(f"{clo}: {count} câu")
    return ", ".join(parts)