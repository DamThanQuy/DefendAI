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


class CodeScanSubmitResponse(BaseModel):
    """202 Accepted: analysis đã được tạo và job đã xếp hàng. Poll GET /api/code/analyses/{id}."""
    analysis_id: int
    job_id: str
    status: str = "queued"


class CodeAnalysisIssueOut(BaseModel):
    id: int
    module: str | None = None
    file: str
    line: int
    type: str | None = None
    severity: str
    description: str | None = None
    suggestion: str | None = None


class CodeAnalysisStatusResponse(BaseModel):
    analysis_id: int
    document_id: int
    status: str
    summary: str | None = None
    total_files: int | None = None
    total_modules: int = 0
    done_modules: int = 0
    stats: dict | None = None
    error: str | None = None
    issues: list[CodeAnalysisIssueOut] = []


class CodeAnalysisStatsResponse(BaseModel):
    """Reduce output: thống kê issues theo severity cho một analysis."""

    analysis_id: int
    status: str
    stats: dict  # {"critical": n, "high": n, "medium": n, "low": n, "info": n}
    total_issues: int


class CodeAnalysisListItem(BaseModel):
    analysis_id: int
    document_id: int
    document_name: str | None = None
    status: str
    total_files: int | None = None
    stats: dict | None = None
    provider: str | None = None
    model: str | None = None
    created_at: str | None = None


class CodeAnalysisListResponse(BaseModel):
    analyses: list[CodeAnalysisListItem] = []