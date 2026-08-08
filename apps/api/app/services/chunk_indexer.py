"""
ChunkIndexer — đổ embedding cho chunks vào document_chunks (RAG).

Sau `parse_and_chunk`, gọi `index_chunks(document, chunks)` để embed từng chunk
(embedder — Gemini, dim 1024) và persist vào `document_chunks` kèm meta JSONB.

Idempotent: mỗi lần re-run, `parse_and_chunk` tạo lại chunks → xoá bản cũ rồi
re-insert cho khớp với chunk hiện tại. Embed chỉ chạy lúc index, không lúc query.

Best-effort: lỗi embed/insert → log + trả 0, không raise — R4 là add-on của luồng
sinh câu hỏi, không được chặn job. Transaction riêng, không đụng session của handler.
"""
import logging
from typing import List

from sqlalchemy import delete

from app.core.database import async_session_maker
from app.models.document_chunk import DocumentChunk
from app.services.embedder import embed

logger = logging.getLogger(__name__)


async def index_chunks(document, chunks: List[str]) -> int:
    """Embed chunks và persist vào document_chunks trong transaction riêng.

    Args:
        document: ORM Document (cần document.id, document.filename, document.doc_type).
        chunks: danh sách chunk text từ `parse_and_chunk`.

    Returns:
        Số chunk đã index; 0 nếu chunks rỗng hoặc có lỗi (best-effort, không raise).
    """
    if not chunks:
        return 0

    try:
        vectors = await embed(chunks)
    except Exception as exc:
        logger.warning("Chunk indexing: embed failed for doc %s: %s", document.id, exc)
        return 0

    doc_type = getattr(document.doc_type, "value", str(document.doc_type))
    rows = [
        DocumentChunk(
            document_id=document.id,
            chunk_index=i,
            content=content,
            embedding=vec,
            meta={
                "doc_type": doc_type,
                "filename": document.filename,
                "chunk_index": i,
            },
        )
        for i, (content, vec) in enumerate(zip(chunks, vectors))
    ]

    try:
        async with async_session_maker() as db:
            # Idempotent: bỏ bản cũ của document, ghi lại bản mới khớp chunks hiện tại
            await db.execute(
                delete(DocumentChunk).where(DocumentChunk.document_id == document.id)
            )
            db.add_all(rows)
            await db.commit()
    except Exception as exc:
        logger.warning("Chunk indexing: persist failed for doc %s: %s", document.id, exc)
        return 0

    return len(rows)
