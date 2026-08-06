"""Schemas cho Chat đề tài (R7) — workspace-scoped RAG chat, multi-turn."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class WorkspaceChatCreateRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    persona: str = "theory"


class WorkspaceChatResponse(BaseModel):
    id: int
    workspace_id: int
    question: str
    answer: Optional[str] = None
    citations: Optional[List[str]] = None
    persona: str
    status: str
    error: Optional[str] = None
    created_at: datetime


class WorkspaceChatCreateResponse(BaseModel):
    chat_id: int
    job_id: str
    status: str
