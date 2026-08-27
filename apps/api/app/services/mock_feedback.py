"""
Feedback Generator Service — Generate qualitative feedback without numerical scores.

Phase 2 Lite: Feedback Generator + CLO Tracking + Quality Signals
"""

import logging
from typing import List, Dict, Any, Optional, Set
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class AnswerAccuracy(str, Enum):
    """Accuracy level of student answer."""
    CORRECT = "correct"
    PARTIAL = "partial"
    INCORRECT = "incorrect"


class AnswerDepth(str, Enum):
    """Depth level of answer."""
    SHALLOW = "shallow"
    MEDIUM = "medium"
    DEEP = "deep"


@dataclass
class QualitySignals:
    """Quality signals extracted from answer for Phase 3 Adaptive."""
    keyword_coverage: float = 0.0          # 0.0-1.0: % expected keywords covered
    depth: AnswerDepth = AnswerDepth.SHALLOW
    accuracy: AnswerAccuracy = AnswerAccuracy.INCORRECT
    confidence: float = 0.0                # 0.0-1.0: AI evaluator confidence


@dataclass
class FeedbackResult:
    """Qualitative feedback result without numerical scores."""
    is_correct: bool = False
    confidence: float = 0.0                # 0.0-1.0
    feedback: str = ""                     # Detailed feedback text
    missing_keywords: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    quality_signals: QualitySignals = field(default_factory=QualitySignals)
    covered_keywords: List[str] = field(default_factory=list)


class FeedbackGenerator:
    """
    Generate qualitative feedback without numerical scores.
    
    Uses LLM to evaluate student answer against expected criteria,
    returns qualitative feedback + quality signals for Phase 3 Adaptive.
    """
    
    # System prompt for feedback generation
    SYSTEM_PROMPT = """Bạn là hội đồng bảo vệ đồ án SEP490. Nhiệm vụ: Đánh giá câu trả lời của sinh viên.

TRẢ VỀ JSON DUY NHẤT (không markdown, không text thừa):
{
  "is_correct": true|false,
  "confidence": 0.0-1.0,
  "feedback": "Phản hồi chi tiết: điểm mạnh, điểm yếu, cần bổ sung gì",
  "missing_keywords": ["kw1", "kw2"],
  "suggestions": ["gợi ý 1", "gợi ý 2"],
  "quality_signals": {
    "keyword_coverage": 0.0-1.0,
    "depth": "shallow|medium|deep",
    "accuracy": "correct|partial|incorrect",
    "confidence": 0.0-1.0
  },
  "covered_keywords": ["kw1", "kw2"]
}

QUY TẮC:
1. is_correct=true nếu câu trả lời cover đủ ý chính + từ khóa quan trọng
2. partial nếu có ý chính nhưng thiếu chi tiết/keyword quan trọng
3. incorrect nếu sai hoàn toàn hoặc bỏ lỡ ý chính
4. feedback phải cụ thể, actionable, tiếng Việt
5. missing_keywords: các từ khóa quan trọng trong câu hỏi/đáp án chuẩn mà sinh viên bỏ lỡ
6. suggestions: gợi ý cụ thể để cải thiện
"""

    # Feedback templates for different accuracy levels
    FEEDBACK_TEMPLATES = {
        AnswerAccuracy.CORRECT: "✅ Xuất sắc! {strength}. Câu trả lời cover đầy đủ các ý chính: {keywords}.",
        AnswerAccuracy.PARTIAL: "⚠️ Phần đúng. {strength}. Tuy nhiên thiếu: {missing}. Cần bổ sung: {suggestion}.",
        AnswerAccuracy.INCORRECT: "❌ Chưa đạt. {weakness}. Thiếu hoàn toàn: {core_concept}. Gợi ý: {hint}. Cần đọc lại {reference}.",
    }

    def __init__(
        self,
        provider: str = "openai",
        model: str = "gpt-4o-mini",
        temperature: float = 0.1,
        max_tokens: int = 1500,
    ):
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

    async def generate_feedback(
        self,
        question: str,
        answer: str,
        context: str,
        expected_keywords: List[str],
        clo: str,
    ) -> FeedbackResult:
        """
        Generate qualitative feedback for a student answer.
        
        Args:
            question: The question asked
            answer: Student's answer
            context: RAG context (document chunks)
            expected_keywords: List of expected keywords for this question
            clo: CLO code (CLO1-CLO7)
            
        Returns:
            FeedbackResult with qualitative feedback + quality signals
        """
        # Build evaluation prompt
        prompt = self._build_evaluation_prompt(
            question=question,
            answer=answer,
            context=context,
            expected_keywords=expected_keywords,
            clo=clo,
        )
        
        try:
            # Call AI Gateway
            from app.services.ai_client import ai_gateway
            result = await ai_gateway.generate(
                prompt=prompt,
                system_prompt=self.SYSTEM_PROMPT,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            
            raw_text = result.get("content", "").strip()
            parsed = self._parse_feedback_json(raw_text)
            
            return FeedbackResult(
                is_correct=parsed.get("is_correct", False),
                confidence=parsed.get("confidence", 0.0),
                feedback=parsed.get("feedback", ""),
                missing_keywords=parsed.get("missing_keywords", []),
                suggestions=parsed.get("suggestions", []),
                quality_signals=QualitySignals(
                    keyword_coverage=parsed.get("quality_signals", {}).get("keyword_coverage", 0.0),
                    depth=AnswerDepth(parsed.get("quality_signals", {}).get("depth", "shallow")),
                    accuracy=AnswerAccuracy(parsed.get("quality_signals", {}).get("accuracy", "incorrect")),
                    confidence=parsed.get("quality_signals", {}).get("confidence", 0.0),
                ),
                covered_keywords=parsed.get("covered_keywords", []),
            )
            
        except Exception as exc:
            logger.warning(f"Feedback generation failed: {exc}, using fallback")
            return self._fallback_feedback(question, answer, expected_keywords)
    
    def _build_evaluation_prompt(
        self,
        question: str,
        answer: str,
        context: str,
        expected_keywords: List[str],
        clo: str,
    ) -> str:
        """Build evaluation prompt for LLM."""
        keywords_str = ", ".join(expected_keywords)
        return f"""Câu hỏi: {question}
CLO: {clo}

Câu trả lời của sinh viên:
{answer}

Ngữ cảnh tài liệu (RAG):
{context[:3000]}

Từ khóa kỳ vọng: {keywords_str}

Hãy đánh giá câu trả lời theo quy tắc bên trên."""

    def _parse_feedback_json(self, raw: str) -> dict:
        """Parse JSON from LLM response, handling markdown fences."""
        text = raw.strip()
        
        # Strip markdown fence
        if text.startswith("```"):
            lines = text.splitlines()
            # Find first ``` line
            start = 0
            for i, line in enumerate(lines):
                if line.strip().startswith("```"):
                    start = i + 1
                    break
            end = len(lines)
            for i in range(len(lines) - 1, -1, -1):
                if lines[i].strip().startswith("```"):
                    end = i
                    break
            text = "\n".join(lines[start:end])
        
        # Find JSON object
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end >= start:
            text = text[start:end + 1]
        
        try:
            import json
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse feedback JSON: {raw[:200]}")
            return {}
    
    def _fallback_feedback(
        self,
        question: str,
        answer: str,
        expected_keywords: List[str],
    ) -> FeedbackResult:
        """Fallback when LLM fails - simple keyword matching."""
        answer_lower = answer.lower()
        query_terms = set(question.lower().split())
        expected_set = set(k.lower() for k in expected_keywords)
        
        found_keywords = [k for k in expected_keywords if k.lower() in answer_lower]
        missing_keywords = [k for k in expected_keywords if k.lower() not in answer_lower]
        
        keyword_coverage = len(found_keywords) / max(len(expected_keywords), 1)
        
        if keyword_coverage >= 0.7:
            accuracy = AnswerAccuracy.CORRECT
            is_correct = True
        elif keyword_coverage >= 0.4:
            accuracy = AnswerAccuracy.PARTIAL
            is_correct = False
        else:
            accuracy = AnswerAccuracy.INCORRECT
            is_correct = False
        
        depth = AnswerDepth.DEEP if len(answer) > 200 else AnswerDepth.MEDIUM if len(answer) > 50 else AnswerDepth.SHALLOW
        
        if accuracy == AnswerAccuracy.CORRECT:
            feedback = f"✅ Tốt! Câu trả lời cover các ý chính: {', '.join(found_keywords)}."
        elif accuracy == AnswerAccuracy.PARTIAL:
            feedback = f"⚠️ Phần đúng. Có ý: {', '.join(found_keywords)}. Thiếu: {', '.join(missing_keywords[:3])}."
        else:
            feedback = f"❌ Chưa đạt. Thiếu ý chính: {', '.join(missing_keywords[:3])}. Gợi ý: Hãy đọc lại tài liệu về {expected_keywords[0] if expected_keywords else 'chủ đề này'}."
        
        return FeedbackResult(
            is_correct=is_correct,
            confidence=0.6,
            feedback=feedback,
            missing_keywords=missing_keywords,
            suggestions=["Bổ sung các từ khóa còn thiếu", "Mở rộng giải thích chi tiết hơn"],
            quality_signals=QualitySignals(
                keyword_coverage=keyword_coverage,
                depth=depth,
                accuracy=accuracy,
                confidence=0.6,
            ),
            covered_keywords=found_keywords,
        )


# Convenience function
async def generate_feedback(
    question: str,
    answer: str,
    context: str,
    expected_keywords: List[str],
    clo: str,
    provider: str = "openai",
    model: str = "gpt-4o-mini",
) -> FeedbackResult:
    """One-liner feedback generation."""
    generator = FeedbackGenerator(provider=provider, model=model)
    return await generator.generate_feedback(question, answer, context, expected_keywords, clo)


# Export
__all__ = [
    "FeedbackGenerator",
    "FeedbackResult",
    "QualitySignals",
    "AnswerAccuracy",
    "AnswerDepth",
    "generate_feedback",
]