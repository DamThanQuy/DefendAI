"""Schemas cho 'Hỏi theo đề tài' (R6) — workspace-scoped RAG questions."""
from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class WorkspaceQuestionCreateRequest(BaseModel):
    topic: str = Field(min_length=0, max_length=1000, default="")


SourceKind = Literal["reference", "user_upload"]


class SourceItemResponse(BaseModel):
    """1 dòng 'Nguồn tham khảo' trong response câu hỏi RAG.

    Tất cả field đã được derive sẵn ở BE — FE chỉ cần render, không tự
    đoán extension hay check `source === 'ref'`.

    Lưu ý: KHÔNG có field `icon` (emoji). Đó là presentation logic, FE tự
    map từ `doc_type` qua icon table riêng.
    """

    num: int
    kind: SourceKind
    title: str  # tên file gốc
    display_title: str  # đã thêm extension nếu thiếu (vd 'Sep490 Rubric' → 'Sep490 Rubric.md')
    doc_type: str  # 'markdown' | 'pdf' | 'docx' | 'pptx' | 'zip' | 'txt' | 'image' | 'other'
    is_markdown: bool
    chunk_index: Optional[int] = None
    content: str


class WorkspaceQuestionResponse(BaseModel):
    id: int
    workspace_id: int
    topic: str
    status: str
    questions: Optional[List[Any]] = None
    sources: Optional[List[SourceItemResponse]] = None
    error: Optional[str] = None
    created_at: datetime


class WorkspaceQuestionCreateResponse(BaseModel):
    question_id: int
    job_id: str
    status: str


class WorkspaceQuestionListResponse(BaseModel):
    """Lịch sử có phân trang."""
    total: int
    limit: int
    offset: int
    items: List[WorkspaceQuestionResponse]