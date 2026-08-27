"""
Quality Signals Extractor — Extract quality signals from student answers.

Phase 2 Lite: Quality Signals for Phase 3 Adaptive.
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class AnswerAccuracy(str, Enum):
    CORRECT = "correct"
    PARTIAL = "partial"
    INCORRECT = "incorrect"


class AnswerDepth(str, Enum):
    SHALLOW = "shallow"
    MEDIUM = "medium"
    DEEP = "deep"


@dataclass
class QualitySignals:
    """Quality signals extracted from student answer for Phase 3 Adaptive."""
    keyword_coverage: float = 0.0          # 0.0-1.0: % expected keywords covered
    depth: AnswerDepth = AnswerDepth.SHALLOW
    accuracy: AnswerAccuracy = AnswerAccuracy.INCORRECT
    confidence: float = 0.0                # 0.0-1.0: AI evaluator confidence


class QualitySignalsExtractor:
    """
    Extract quality signals from student answer for Phase 3 Adaptive.
    
    Signals extracted:
    - keyword_coverage: % of expected keywords covered
    - depth: shallow|medium|deep (based on answer length, detail)
    - accuracy: correct|partial|incorrect
    - confidence: AI evaluator confidence
    """
    
    def __init__(
        self,
        min_deep_chars: int = 300,
        min_medium_chars: int = 100,
    ):
        self.min_deep_chars = min_deep_chars
        self.min_medium_chars = min_medium_chars
    
    def extract(
        self,
        answer: str,
        expected_keywords: List[str],
        question: str = "",
        context: str = "",
        feedback_result: Optional[Any] = None,
    ) -> QualitySignals:
        """
        Extract quality signals from student answer.
        
        Args:
            answer: Student's answer text
            expected_keywords: List of expected keywords for this question
            question: Original question (for context)
            feedback_result: Optional FeedbackResult from FeedbackGenerator
            
        Returns:
            QualitySignals with extracted signals
        """
        signals = QualitySignals()
        
        # 1. Keyword Coverage
        signals.keyword_coverage = self._calculate_keyword_coverage(
            answer, expected_keywords
        )
        
        # 2. Depth (based on answer length and detail)
        signals.depth = self._calculate_depth(answer)
        
        # 3. Accuracy (from feedback result or keyword matching)
        if feedback_result and hasattr(feedback_result, 'quality_signals'):
            signals.accuracy = feedback_result.quality_signals.accuracy
        else:
            signals.accuracy = self._estimate_accuracy(
                answer, expected_keywords
            )
        
        # 4. Confidence (from feedback or estimated)
        if feedback_result and hasattr(feedback_result, 'confidence'):
            signals.confidence = feedback_result.confidence
        else:
            signals.confidence = self._estimate_confidence(
                answer, expected_keywords
            )
        
        return signals
    
    def _calculate_keyword_coverage(
        self,
        answer: str,
        expected_keywords: List[str],
    ) -> float:
        """Calculate % of expected keywords covered in answer."""
        if not expected_keywords:
            return 1.0  # No keywords to check
        
        answer_lower = answer.lower()
        found = sum(1 for kw in expected_keywords if kw.lower() in answer_lower)
        return found / len(expected_keywords)
    
    def _calculate_depth(self, answer: str) -> AnswerDepth:
        """Estimate answer depth based on length and structure."""
        answer = answer.strip()
        char_count = len(answer)
        
        # Count structural elements (lists, paragraphs, code blocks)
        structure_score = 0
        if '\n' in answer:
            structure_score += 1
        if any(marker in answer for marker in ['1.', '2.', '-', '*', '•']):
            structure_score += 1
        if '```' in answer or '`' in answer:
            structure_score += 1
        
        # Base on length
        if char_count >= self.min_deep_chars and structure_score >= 1:
            return AnswerDepth.DEEP
        elif char_count >= self.min_medium_chars:
            return AnswerDepth.MEDIUM
        else:
            return AnswerDepth.SHALLOW
    
    def _estimate_accuracy(
        self,
        answer: str,
        expected_keywords: List[str],
    ) -> AnswerAccuracy:
        """Estimate accuracy based on keyword coverage."""
        if not expected_keywords:
            return AnswerAccuracy.CORRECT  # No keywords to verify
        
        coverage = self._calculate_keyword_coverage(answer, expected_keywords)
        
        if coverage >= 0.7:
            return AnswerAccuracy.CORRECT
        elif coverage >= 0.4:
            return AnswerAccuracy.PARTIAL
        else:
            return AnswerAccuracy.INCORRECT
    
    def _estimate_confidence(
        self,
        answer: str,
        expected_keywords: List[str],
    ) -> float:
        """Estimate evaluator confidence based on answer quality."""
        coverage = self._calculate_keyword_coverage(answer, expected_keywords)
        depth_bonus = {
            AnswerDepth.DEEP: 0.2,
            AnswerDepth.MEDIUM: 0.1,
            AnswerDepth.SHALLOW: 0.0,
        }
        
        base_confidence = min(0.5 + coverage * 0.4, 0.9)
        depth = self._calculate_depth("")
        # We need to calculate depth properly
        depth_val = self._calculate_depth(answer)
        depth_bonus_val = {
            AnswerDepth.DEEP: 0.2,
            AnswerDepth.MEDIUM: 0.1,
            AnswerDepth.SHALLOW: 0.0,
        }.get(depth, 0.0)
        
        return min(base_confidence + depth_bonus_val, 0.95)


# Convenience function
def extract_quality_signals(
    answer: str,
    expected_keywords: List[str],
    question: str = "",
    feedback_result: Optional[Any] = None,
) -> QualitySignals:
    """One-liner to extract quality signals."""
    extractor = QualitySignalsExtractor()
    return extractor.extract(answer, expected_keywords, feedback_result=feedback_result)


__all__ = [
    "QualitySignalsExtractor",
    "QualitySignals",
    "AnswerAccuracy",
    "AnswerDepth",
    "extract_quality_signals",
]