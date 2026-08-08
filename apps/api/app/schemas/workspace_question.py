"""Schemas cho 'Hỏi theo đề tài' (R6) — workspace-scoped RAG questions."""
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


class WorkspaceQuestionCreateRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=1000)
    persona: str = "theory"


class WorkspaceQuestionResponse(BaseModel):
    id: int
    workspace_id: int
    topic: str
    persona: str
    status: str
    questions: Optional[List[Any]] = None
    sources: Optional[List[Any]] = None  # [{num, source, title, chunk_index, content}] — nguồn đã dùng
    error: Optional[str] = None
    created_at: datetime


class WorkspaceQuestionCreateResponse(BaseModel):
    question_id: int
    job_id: str
    status: str