"""
ReferenceIndexer (R9) — đổ tài liệu chuẩn (rubric/giáo trình/mẫu) vào reference_chunks.

Phân biệt với user chunks: `Document.purpose` là nguồn duy nhất quyết định —
`student_project` → document_chunks (R4), `staff_reference` → reference_chunks (R9).
`reference_chunks` không có FK document_id; dùng chung mọi user.

Re-index theo (category, title): upload lại cùng title → xoá bản cũ, ghi bản mới
(không nhân đôi). Khác R4 (best-effort): lỗi parse/embed → RAISE để handler
đánh job `failed` — admin phải biết tài liệu chuẩn chưa index được.
"""
import logging
from typing import List

from sqlalchemy import delete, select

from app.core.database import async_session_maker
from app.models.entities import Document, DocumentPurpose, ReferenceChunk
from app.services.document_parser import parse_and_chunk
from app.services.embedder import embed
from app.services.storage import delete_doc

logger = logging.getLogger(__name__)


async def index_reference(document, category: str, title: str, source: str = "") -> int:
    """Parse + embed + ghi vào reference_chunks (re-index theo category+title).

    Args:
        document: ORM Document (purpose=staff_reference, cần storage_key + doc_type).
        category: textbook | rubric | sample_project | spec.
        title: tên tài liệu chuẩn — chìa khoá re-index (upload lại = thay thế).
        source: nguồn tham khảo (tuỳ chọn), lưu vào meta.

    Returns:
        Số chunk đã index.

    Raises:
        DocumentParserError / httpx.HTTPStatusError / ValueError: parse hoặc embed lỗi.
    """
    chunks: List[str] = await parse_and_chunk(document)
    if not chunks:
        raise ValueError(f"Không trích được text từ {document.filename}")

    vectors = await embed(chunks)

    rows = [
        ReferenceChunk(
            category=category,
            title=title,
            content=content,
            embedding=vec,
            meta={
                "source": source or "",
                "filename": document.filename,
                "document_id": document.id,  # truy vết file gốc khi delete
                "chunk_index": i,
            },
        )
        for i, (content, vec) in enumerate(zip(chunks, vectors))
    ]

    async with async_session_maker() as db:
        # Re-index thay thế: cùng (category, title) → bỏ bản cũ, không nhân đôi.
        # Thu thập document_id cũ TRƯỚC khi xoá chunks (để dọn Document mồ côi).
        old_result = await db.execute(
            select(ReferenceChunk.meta["document_id"].astext)
            .where(
                ReferenceChunk.category == category,
                ReferenceChunk.title == title,
            )
            .distinct()
        )
        old_doc_ids = [int(r[0]) for r in old_result.fetchall() if r[0]]

        await db.execute(
            delete(ReferenceChunk).where(
                ReferenceChunk.category == category,
                ReferenceChunk.title == title,
            )
        )
        db.add_all(rows)
        await db.commit()

        old_storage_keys: List[str] = []
        if old_doc_ids:
            old_docs_result = await db.execute(
                select(Document).where(
                    Document.id.in_(old_doc_ids),
                    Document.purpose == DocumentPurpose.staff_reference,
                )
            )
            for doc in old_docs_result.scalars().all():
                old_storage_keys.append(doc.storage_key)
                await db.delete(doc)
            await db.commit()

    # File MinIO cũ best-effort — không chặn index
    for key in old_storage_keys:
        try:
            await delete_doc(key)
        except Exception as exc:
            logger.warning("Delete old MinIO %s failed: %s", key, exc)

    return len(rows)


async def delete_reference(category: str, title: str) -> dict:
    """Xoá tài liệu chuẩn: chunks + Document gốc (staff_reference) + file MinIO.

    Truy vết file gốc qua `meta->>'document_id'` (ghi từ index_reference).

    Returns:
        {"deleted_chunks": int, "deleted_documents": int}.
    """
    async with async_session_maker() as db:
        result = await db.execute(
            select(ReferenceChunk.meta["document_id"].astext)
            .where(
                ReferenceChunk.category == category,
                ReferenceChunk.title == title,
            )
            .distinct()
        )
        doc_ids = [int(r[0]) for r in result.fetchall() if r[0]]

        # Chunks trước (đọc doc_ids xong mới xoá)
        del_result = await db.execute(
            delete(ReferenceChunk).where(
                ReferenceChunk.category == category,
                ReferenceChunk.title == title,
            )
        )
        deleted_chunks = del_result.rowcount or 0

        deleted_documents = 0
        storage_keys: List[str] = []
        if doc_ids:
            docs_result = await db.execute(
                select(Document).where(
                    Document.id.in_(doc_ids),
                    Document.purpose == DocumentPurpose.staff_reference,
                )
            )
            docs = docs_result.scalars().all()
            for doc in docs:
                storage_keys.append(doc.storage_key)
                await db.delete(doc)
            deleted_documents = len(docs)
        await db.commit()

    # File MinIO best-effort — không chặn delete
    for key in storage_keys:
        try:
            await delete_doc(key)
        except Exception as exc:
            logger.warning("Delete MinIO %s failed: %s", key, exc)

    return {"deleted_chunks": deleted_chunks, "deleted_documents": deleted_documents}
