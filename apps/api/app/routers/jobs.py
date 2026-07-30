"""Router cho async job polling."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.job import JobStatusResponse
from app.services.job_queue import get_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


@router.get(
    "/{job_id}",
    response_model=JobStatusResponse,
    summary="Lấy trạng thái và kết quả của job",
    description="Frontend poll endpoint để lấy kết quả xử lý bất đồng bộ.",
)
async def get_job_status(job_id: str) -> JobStatusResponse:
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    return JobStatusResponse(
        job_id=job["job_id"],
        type=job.get("type", ""),
        status=job.get("status", "failed"),
        progress=job.get("progress"),
        result=job.get("result"),
        error=job.get("error"),
        created_at=job.get("created_at"),
        updated_at=job.get("updated_at"),
    )
