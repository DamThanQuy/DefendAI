"""
ChunkIndexer — đổ embedding cho chunks vào document_chunks (RAG).

Sau `parse_and_chunk`, gọi `index_chunks(document, chunks, diagrams)` để embed từng chunk
(embedder — Gemini, dim 1024) và persist vào `document_chunks` kèm meta JSONB.

Fix D: khi có `diagram_infos` (vision reader trả về kèm figure number + kind),
MỖI diagram được index thành MỘT chunk riêng với text
"Figure 42 (UI screen): <mô tả>. Caption: ..." và meta
{type:"diagram", figure:42, kind:"screen"} — retriever tìm đúng sơ đồ khi câu
hỏi nhắc tới figure/màn hình cụ thể. Chunk text thường vẫn giữ flag
`has_diagram` ở chunk cuối để tương thích.

Idempotent: mỗi lần re-run, `parse_and_chunk` tạo lại chunks → xoá bản cũ rồi
re-insert cho khớp chunks hiện tại. Embed chỉ chạy lúc index, không lúc query.

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

_KIND_LABEL = {
    "diagram": "technical diagram",
    "screen": "UI screen",
    "photo": "photo",
}


def diagram_chunk_text(info) -> str:
    """Text chuẩn hoá của 1 diagram chunk (dùng khi index và khi hiển thị citation)."""
    kind = _KIND_LABEL.get(getattr(info, "kind", "unknown"), "figure")
    fig = getattr(info, "figure", None)
    caption = (getattr(info, "caption", "") or "").strip()
    head = f"Figure {fig} ({kind})" if fig is not None else f"{kind.capitalize()} (uncaptioned)"
    if caption:
        head += f": {caption}"
    return f"{head}. {getattr(info, 'description', '').strip()}"


async def index_chunks(document, chunks: List[str], diagrams: List[str] | None = None,
                       diagram_infos: List | None = None) -> int:
    """Embed chunks và persist vào document_chunks trong transaction riêng.

    Args:
        document: ORM Document (cần document.id, document.filename, document.doc_type).
        chunks: danh sách chunk text từ `parse_and_chunk`.
        diagrams: mô tả diagram từ vision reader (optional). Nếu có, chunk cuối
                  được gắn meta.has_diagram=true.
        diagram_infos: list[DiagramInfo] có figure/kind (Fix C). Nếu có, mỗi diagram
                  được index thành chunk riêng (meta.type="diagram").

    Returns:
        Số chunk đã index; 0 nếu chunks rỗng hoặc có lỗi (best-effort, không raise).
    """
    if not chunks:
        return 0

    # Fix D: mỗi diagram là 1 chunk riêng, đặt SAU các chunk text.
    diagram_texts: List[str] = []
    diagram_meta: List[dict] = []
    for info in (diagram_infos or []):
        text = diagram_chunk_text(info)
        if not text.strip():
            continue
        diagram_texts.append(text)
        diagram_meta.append({
            "type": "diagram",
            "figure": getattr(info, "figure", None),
            "kind": getattr(info, "kind", "unknown"),
            "caption": getattr(info, "caption", ""),
        })

    all_texts = list(chunks) + diagram_texts

    try:
        vectors = await embed(all_texts)
    except Exception as exc:
        logger.warning("Chunk indexing: embed failed for doc %s: %s", document.id, exc)
        return 0

    doc_type = getattr(document.doc_type, "value", str(document.doc_type))
    has_diagrams = bool(diagrams) or bool(diagram_texts)
    n_text = len(chunks)

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
                # Tag chunk text cuối nếu tài liệu có diagram (để AI cite đúng sơ đồ)
                "has_diagram": has_diagrams and i == n_text - 1,
                **(diagram_meta[i - n_text] if i >= n_text else {"type": "text"}),
            },
        )
        for i, (content, vec) in enumerate(zip(all_texts, vectors))
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

    if diagram_texts:
        logger.info(
            "Indexed %d text chunks + %d diagram chunks for doc %s",
            n_text, len(diagram_texts), document.id,
        )
    return len(rows)