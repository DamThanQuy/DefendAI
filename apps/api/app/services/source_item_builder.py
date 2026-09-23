"""Build shape chuẩn cho từng source item trong response câu hỏi RAG.

Tách riêng từ handler để:
- Single source of truth cho FE (FE không phải tự derive extension/icon/loại).
- Pure function → pytest dễ (không cần mock DB).
- Khi cần đổi cách map `doc_type` (vd thêm enum mới) chỉ sửa 1 chỗ.

KHÔNG có field `icon` (emoji) ở đây vì đó là presentation logic — FE tự
map từ `doc_type` qua icon table của riêng FE.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# Bảng map extension → doc_type chuẩn dùng khi `meta->>'doc_type'` không có
# (chunk cũ) hoặc là "other". Luôn lowercase.
_EXT_TO_DOC_TYPE = {
    "md": "markdown",
    "markdown": "markdown",
    "pdf": "pdf",
    "docx": "docx",
    "pptx": "pptx",
    "zip": "zip",
    "txt": "txt",
    "png": "image",
    "jpg": "image",
    "jpeg": "image",
}


def normalize_doc_type(raw: Optional[str], title: str) -> str:
    """Đưa `doc_type` về 1 chuẩn duy nhất.

    Ưu tiên giá trị BE đã lưu (`meta->>'doc_type'`); nếu rỗng/None/'other' thì
    suy từ extension của title. Reference chunk thường không có extension →
    fallback cuối cùng là 'markdown' (ref knowledge base chủ yếu là .md).
    """
    if raw:
        low = raw.lower()
        if low != "other":
            return low
    if title and "." in title:
        ext = title.rsplit(".", 1)[-1].lower()
        if ext in _EXT_TO_DOC_TYPE:
            return _EXT_TO_DOC_TYPE[ext]
    return "markdown"


def build_display_title(title: str, doc_type: str) -> str:
    """Thêm extension nếu title thiếu (vd 'Sep490 Rubric' → 'Sep490 Rubric.md')."""
    if not title or "." in title:
        return title
    ext = "md" if doc_type == "markdown" else doc_type
    return f"{title}.{ext}"


def to_source_item(num: int, raw: Dict[str, Any]) -> Dict[str, Any]:
    """Convert 1 retrieve-result thô thành dict đúng shape `SourceItemResponse`.

    Input (raw) keys có thể có: `source` ('ref'|'user'), `title` hoặc `filename`,
    `chunk_index`, `content`, `doc_type` (optional — chỉ user chunks mới có).
    """
    title = str(raw.get("title") or raw.get("filename") or "")
    doc_type = normalize_doc_type(raw.get("doc_type"), title)
    return {
        "num": num,
        "kind": "reference" if raw.get("source") == "ref" else "user_upload",
        "title": title,
        "display_title": build_display_title(title, doc_type),
        "doc_type": doc_type,
        "is_markdown": doc_type == "markdown",
        "chunk_index": raw.get("chunk_index"),
        "content": str(raw.get("content") or "")[:500],
    }


def to_source_list(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Apply `to_source_item` cho cả list, đánh số 1..N."""
    return [to_source_item(i + 1, r) for i, r in enumerate(results)]
