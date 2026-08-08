"""
Retriever Service — top-K chunks liên quan nhất theo workspace (RAG, R5 + R10).

Retrieve: embed câu hỏi (embedder — Gemini) → SQL KNN trên `document_chunks`,
join qua `workspace_files` để giới hạn theo workspace. Lọc theo score threshold,
trả kèm nguồn `filename` + `chunk_index` cho citation.

R10: thêm query song song trên `reference_chunks` (tài liệu chuẩn) — `retrieve_mixed`
embed 1 lần, chạy 2 KNN đồng thời (asyncio.gather), gộp kèm nhãn `source`.

Config (.env): `RAG_TOP_K` (mặc định 8), `RAG_MIN_SCORE` (mặc định 0.3),
`RAG_REF_TOP_K` (mặc định 4), `RAG_REF_MIN_SCORE` (mặc định 0.25).
"""
import asyncio
import logging
from typing import List, Optional, Tuple

from sqlalchemy import text

from app.core.config import settings
from app.core.database import async_session_maker
from app.services.embedder import embed

logger = logging.getLogger(__name__)

_KNN_SQL = text("""
    SELECT c.content,
           c.meta->>'filename' AS filename,
           c.chunk_index,
           1 - (c.embedding <=> CAST(:q AS vector)) AS score
    FROM document_chunks c
    JOIN workspace_files wf ON wf.document_id = c.document_id
    WHERE wf.workspace_id = :ws
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> CAST(:q AS vector)) >= :min_score
    ORDER BY c.embedding <=> CAST(:q AS vector)
    LIMIT :top_k
""")

_REF_KNN_SQL = text("""
    SELECT c.content,
           c.title,
           c.meta->>'chunk_index' AS chunk_index,
           1 - (c.embedding <=> CAST(:q AS vector)) AS score
    FROM reference_chunks c
    WHERE c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> CAST(:q AS vector)) >= :min_score
    ORDER BY c.embedding <=> CAST(:q AS vector)
    LIMIT :top_k
""")


def _vector_literal(vec) -> str:
    """Nối vector float → literal pgvector '[0.1,-0.02,...]' cho bind :q::vector."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


async def retrieve(
    query: str,
    workspace_id: int,
    top_k: Optional[int] = None,
) -> List[dict]:
    """Tìm top-K chunks gần nhất với query trong workspace.

    Args:
        query: câu hỏi / đề tài cần truy vấn.
        workspace_id: workspace chứa các document cần tìm.
        top_k: số chunk trả về (mặc định `settings.rag.top_k` = 8).

    Returns:
        list[dict] — mỗi item {content, filename, chunk_index, score, source:"user"}
        xếp theo độ liên quan giảm dần. [] nếu workspace chưa có chunk nào được index
        (chưa qua R4) hoặc tất cả dưới `min_score`.

    Raises:
        RuntimeError/httpx.HTTPStatusError: nếu embed câu hỏi thất bại.
    """
    q_vec = (await embed([query]))[0]
    limit = top_k or settings.rag.top_k

    async with async_session_maker() as db:
        result = await db.execute(
            _KNN_SQL,
            {
                "q": _vector_literal(q_vec),
                "ws": workspace_id,
                "min_score": settings.rag.min_score,
                "top_k": limit,
            },
        )
        rows = result.mappings().all()

    return [
        {
            "content": row["content"],
            "filename": row["filename"],
            "chunk_index": row["chunk_index"],
            "score": round(float(row["score"]), 4),
            "source": "user",
        }
        for row in rows
    ]


async def retrieve_reference(
    query: str,
    top_k: Optional[int] = None,
) -> List[dict]:
    """Tìm top-K chunks liên quan nhất trong `reference_chunks` (tài liệu chuẩn, R10).

    Args:
        query: câu hỏi / đề tài cần truy vấn.
        top_k: số chunk trả về (mặc định `settings.rag.ref_top_k` = 4).

    Returns:
        list[dict] — mỗi item {content, title, chunk_index, score, source:"ref"}.
        [] nếu chưa có tài liệu chuẩn được index (R9) hoặc tất cả dưới `ref_min_score`.

    Raises:
        RuntimeError/httpx.HTTPStatusError: nếu embed câu hỏi thất bại.
    """
    q_vec = (await embed([query]))[0]
    limit = top_k or settings.rag.ref_top_k

    async with async_session_maker() as db:
        result = await db.execute(
            _REF_KNN_SQL,
            {
                "q": _vector_literal(q_vec),
                "min_score": settings.rag.ref_min_score,
                "top_k": limit,
            },
        )
        rows = result.mappings().all()

    return [
        {
            "content": row["content"],
            "title": row["title"],
            "chunk_index": row["chunk_index"],
            "score": round(float(row["score"]), 4),
            "source": "ref",
        }
        for row in rows
    ]


async def retrieve_mixed(
    query: str,
    workspace_id: int,
    top_k: Optional[int] = None,
) -> Tuple[List[dict], List[dict]]:
    """R10: embed câu hỏi 1 lần → chạy 2 KNN song song (user + reference).

    Gộp kết quả 2 bảng (`document_chunks` + `reference_chunks`) để handler bỏ
    vào cùng 1 prompt với nhãn nguồn `[USER: ...]` / `[REF: ...]`.

    Returns:
        (user_items, ref_items) — mỗi item kèm `source` ("user"|"ref").

    Raises:
        RuntimeError/httpx.HTTPStatusError: nếu embed câu hỏi thất bại.
    """
    q_lit = _vector_literal((await embed([query]))[0])
    user_limit = top_k or settings.rag.top_k
    ref_limit = settings.rag.ref_top_k

    async def _user() -> List[dict]:
        async with async_session_maker() as db:
            result = await db.execute(
                _KNN_SQL,
                {
                    "q": q_lit,
                    "ws": workspace_id,
                    "min_score": settings.rag.min_score,
                    "top_k": user_limit,
                },
            )
            rows = result.mappings().all()
        return [
            {
                "content": row["content"],
                "filename": row["filename"],
                "chunk_index": row["chunk_index"],
                "score": round(float(row["score"]), 4),
                "source": "user",
            }
            for row in rows
        ]

    async def _ref() -> List[dict]:
        async with async_session_maker() as db:
            result = await db.execute(
                _REF_KNN_SQL,
                {
                    "q": q_lit,
                    "min_score": settings.rag.ref_min_score,
                    "top_k": ref_limit,
                },
            )
            rows = result.mappings().all()
        return [
            {
                "content": row["content"],
                "title": row["title"],
                "chunk_index": row["chunk_index"],
                "score": round(float(row["score"]), 4),
                "source": "ref",
            }
            for row in rows
        ]

    return await asyncio.gather(_user(), _ref())
