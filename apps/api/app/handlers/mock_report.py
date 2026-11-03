"""Handler cho job 'mock_report': AI tổng hợp nhận xét cho báo cáo sau buổi Mock AI."""
from __future__ import annotations

from typing import Any

from app.services.job_queue import register_handler
from app.services.mock_report import JOB_TYPE, generate_ai_review


@register_handler(JOB_TYPE)
async def handle_mock_report(params: dict[str, Any]) -> dict[str, Any]:
    return await generate_ai_review(int(params["report_id"]), params.get("requested_at"))
