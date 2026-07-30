"""Pydantic schemas cho async job queue."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


JobStatus = Literal["queued", "processing", "completed", "failed"]


class JobResponse(BaseModel):
    """Response khi tạo job mới (202 Accepted)."""
    job_id: str = Field(..., description="UUID của job để poll kết quả")
    status: JobStatus = "queued"
    message: str = "Job đã được xếp hàng chờ xử lý"


class JobStatusResponse(BaseModel):
    """Trạng thái hiện tại của job."""
    job_id: str
    type: str
    status: JobStatus
    progress: str | None = None
    result: Any = None
    error: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
