"""Pydantic schemas cho code scan / code review."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


CodeSeverity = Literal["critical", "high", "medium", "low", "info"]


class CodeIssue(BaseModel):
    id: int
    type: str
    file: str
    line: int = Field(ge=1)
    description: str
    severity: CodeSeverity
    suggestion: str


class CodeScanRequest(BaseModel):
    document_id: int
    provider: str | None = None
    model: str | None = None


class CodeScanResponse(BaseModel):
    analysis_id: int
    document_id: int
    document_name: str
    status: str
    summary: str
    pass_rate: float
    files_scanned: int
    issues: list[CodeIssue]
    provider: str | None = None
    model: str | None = None
