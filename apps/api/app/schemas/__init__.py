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
from app.schemas.code_scan import (
    CodeAnalysisIssueOut,
    CodeAnalysisStatusResponse,
    CodeIssue,
    CodeScanRequest,
    CodeScanSubmitResponse,
)
from app.schemas.user import (
    RegisterRequest,
    LoginRequest,
    GoogleLoginRequest,
    UserResponse,
    AuthResponse,
)

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
    "CodeScanSubmitResponse",
    "CodeAnalysisStatusResponse",
    "CodeAnalysisIssueOut",
    "RegisterRequest",
    "LoginRequest",
    "GoogleLoginRequest",
    "UserResponse",
    "AuthResponse",
]