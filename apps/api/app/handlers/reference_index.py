"""Handler cho job 'reference_index' (R9): admin đổ tài liệu chuẩn → reference_chunks."""
from __future__ import annotations

import logging

from sqlalchemy import select

from app.core.database import async_session_maker
from app.models.entities import Document
from app.services.job_queue import register_handler, update_job
from app.services.reference_indexer import index_reference

logger = logging.getLogger(__name__)


@register_handler("reference_index")
async def handle_reference_index(params: dict) -> dict:
    document_id: int = params["document_id"]
    category: str = params["category"]
    title: str = params["title"]
    source: str = params.get("source", "")
    job_id = params.get("_job_id")

    async with async_session_maker() as db:
        result = await db.execute(select(Document).where(Document.id == document_id))
        document = result.scalar_one_or_none()
        if not document:
            raise ValueError(f"Document {document_id} not found")

    if job_id:
        await update_job(job_id, progress="30")

    n = await index_reference(document, category, title, source)

    if job_id:
        await update_job(job_id, progress="90")

    return {
        "document_id": document_id,
        "title": title,
        "category": category,
        "chunks": n,
    }
