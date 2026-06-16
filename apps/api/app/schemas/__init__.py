"""
Pydantic schemas package.

Chứa các model request/response cho API endpoints.
"""
from app.schemas.ai import AIRequest, AIResponse, AICompareRequest, AICompareResponse
from app.schemas.assessment import (
    AssessmentQuestion,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
)
from app.schemas.code_scan import CodeIssue, CodeScanRequest, CodeScanResponse

__all__ = [
    "AIRequest",
    "AIResponse",
    "AICompareRequest",
    "AICompareResponse",
    "AssessmentQuestion",
    "GenerateQuestionsRequest",
    "GenerateQuestionsResponse",
    "CodeIssue",
    "CodeScanRequest",
    "CodeScanResponse",
]