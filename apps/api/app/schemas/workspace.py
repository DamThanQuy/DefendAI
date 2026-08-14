"""Pydantic schemas cho Workspace endpoints."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.entities import DocType


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Tên đề tài")


class WorkspaceRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Tên mới")


class WorkspaceFileAdd(BaseModel):
    document_id: int = Field(..., description="Document id cần thêm")
    role: str = Field("main", description="main / attachment")


class WorkspaceFileOut(BaseModel):
    document_id: int
    filename: str
    file_type: str
    doc_type: DocType
    role: str
    added_at: datetime

    class Config:
        from_attributes = True


class WorkspaceOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    document_count: int = 0
    files: list[WorkspaceFileOut] = []

    class Config:
        from_attributes = True


class WorkspaceListResponse(BaseModel):
    total: int
    items: list[WorkspaceOut]


class SessionItem(BaseModel):
    id: int
    document_id: int
    document_name: str
    persona: Optional[str] = None  # assessments only
    status: str
    issue_count: Optional[int] = None  # code_analyses only
    created_at: datetime


class WorkspaceSessionsResponse(BaseModel):
    workspace_id: int
    workspace_name: str
    assessments: list[SessionItem] = []
    code_analyses: list[SessionItem] = []
