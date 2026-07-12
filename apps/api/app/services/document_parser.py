"""
Document Parser Service — Trích xuất text từ PDF/DOCX/PPTX và chunking.

Luồng xử lý:
    Upload file (PDF/DOCX/PPTX)
        ↓
    Lưu file trên disk (uploads/)
        ↓
    DB lưu metadata (filename, doc_type, file_path, status)
        ↓
    DocumentParser.parse(document) -> text
        ↓
    chunk_text(text) -> list[str]  (~1000 tokens/chunk, overlap 150)
        ↓
    Lưu chunks vào assessments.chunks (JSONB)
        ↓
    User chọn Persona → AI đọc chunks + prompt → sinh 10 câu hỏi

Tham khảo:
    PyPDF2:       https://pypdf2.readthedocs.io
    python-docx:  https://python-docx.readthedocs.io
    python-pptx:  https://python-pptx.readthedocs.io
"""
from io import BytesIO

import logging
from pathlib import Path
from typing import List

from PyPDF2 import PdfReader
from docx import Document as DocxDocument
from pptx import Presentation

from app.models.document import DocType, Document
from app.services.storage import get_doc

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
# Số ký tự ước lượng cho ~1000 tokens (tiếng Anh ~4 chars/token, tiếng Việt ~2)
CHUNK_SIZE_CHARS = 4000      # ~1000 tokens
CHUNK_OVERLAP_CHARS = 600    # ~150 tokens overlap để giữ ngữ cảnh

# Ngưỡng cảnh báo khi trích xuất được quá ít text (file scan, file rỗng, ...)
MIN_TEXT_LENGTH_WARN = 50


class DocumentParserError(Exception):
    """Lỗi khi parse document (file không đọc được, format sai, ...)."""


# ---------------------------------------------------------------------------
# Extractors — mỗi loại file một hàm riêng
# ---------------------------------------------------------------------------
def _extract_pdf(src) -> str:
    """Trích xuất text từ PDF. Nhận str path hoặc file-like object."""
    reader = PdfReader(src)
    pages: List[str] = []
    for idx, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # một trang lỗi không chặn cả file
            logger.warning("PDF page %s extract failed: %s", idx, exc)
            text = ""
        pages.append(text)
    return "\n\n".join(pages).strip()


def _extract_docx(src) -> str:
    """Trích xuất text từ DOCX. Nhận str path hoặc file-like object."""
    doc = DocxDocument(src)

    parts: List[str] = [p.text for p in doc.paragraphs if p.text]

    for table in doc.tables:
        for row in table.rows:
            row_text = "\t".join(cell.text for cell in row.cells)
            if row_text.strip():
                parts.append(row_text)

    return "\n".join(parts).strip()


def _extract_pptx(src) -> str:
    """Trích xuất text từ PPTX. Nhận str path hoặc file-like object."""
    prs = Presentation(src)
    blocks: List[str] = []
    for slide_idx, slide in enumerate(prs.slides, start=1):
        slide_lines: List[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    text = "".join(run.text for run in para.runs).strip()
                    if text:
                        slide_lines.append(text)
        if slide_lines:
            blocks.append(f"### Slide {slide_idx}\n" + "\n".join(slide_lines))
    return "\n\n".join(blocks).strip()


_EXTRACTORS = {
    DocType.PDF: _extract_pdf,
    DocType.DOCX: _extract_docx,
    DocType.PPTX: _extract_pptx,
}


# ---------------------------------------------------------------------------
# Public API — dùng từ router / service khác
# ---------------------------------------------------------------------------
async def extract_text(document) -> str:
    """
    Đọc file từ MinIO theo document.doc_type và trích xuất toàn bộ text.

    Args:
        document: ORM Document (cần doc_type + storage_key).

    Returns:
        Text thô, đã strip. Trả về "" nếu file không có text.

    Raises:
        DocumentParserError: nếu doc_type không hỗ trợ hoặc file lỗi.
    """
    extractor = _EXTRACTORS.get(document.doc_type)
    if extractor is None:
        raise DocumentParserError(f"Unsupported doc_type: {document.doc_type}")

    storage_key = document.storage_key
    if not storage_key:
        raise DocumentParserError(f"Document {document.id} has no storage key")

    try:
        data = await get_doc(storage_key)
    except Exception as exc:
        logger.exception("Failed to download %s from MinIO", storage_key)
        raise DocumentParserError(f"Download failed for {storage_key}: {exc}") from exc

    # Chuyển bytes → file-like object để parser đọc
    file_io = BytesIO(data)

    try:
        text = extractor(file_io)
    except DocumentParserError:
        raise
    except Exception as exc:
        logger.exception("Failed to extract text from %s", storage_key)
        raise DocumentParserError(f"Extract failed for {storage_key}: {exc}") from exc

    if len(text) < MIN_TEXT_LENGTH_WARN:
        logger.warning(
            "Extracted text is suspiciously short (%s chars) from %s "
            "(file có thể là scan, ảnh, hoặc rỗng).",
            len(text), storage_key,
        )

    return text


def chunk_text(text: str,
               chunk_size: int = CHUNK_SIZE_CHARS,
               overlap: int = CHUNK_OVERLAP_CHARS) -> List[str]:
    """
    Cắt text dài thành các chunk ~1000 tokens (~4000 chars), overlap ~150 tokens.

    Cắt theo ranh giới tự nhiên (paragraph → sentence) để chunk gọn ý,
    tránh cắt giữa câu.

    Args:
        text: text đầu vào.
        chunk_size: số ký tự tối đa mỗi chunk (mặc định 4000 ≈ 1000 tokens).
        overlap: số ký tự overlap giữa 2 chunk liên tiếp (mặc định 600 ≈ 150).

    Returns:
        Danh sách string, mỗi phần tử là một chunk.
    """
    if not text or not text.strip():
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must satisfy 0 <= overlap < chunk_size")

    # Đầu tiên tách theo paragraph, giữ lại paragraph rỗng để làm ranh giới mềm
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    chunks: List[str] = []
    current = ""

    for para in paragraphs:
        # Nếu thêm cả paragraph vượt quá chunk_size, flush current và bắt đầu chunk mới
        if len(current) + len(para) + 2 > chunk_size:
            if current:
                chunks.append(current.strip())
                # tạo overlap từ cuối chunk trước
                tail = current[-overlap:] if overlap > 0 else ""
                current = (tail + "\n\n" + para).strip()
            else:
                # paragraph đơn lẻ đã dài hơn chunk_size → cắt cứng theo sentence
                current = _hard_split(para, chunk_size, overlap, chunks)
                continue

            # nếu sau khi thêm mà current đã quá dài, cắt cứng tiếp
            if len(current) > chunk_size:
                current = _hard_split(current, chunk_size, overlap, chunks)
        else:
            current = (current + "\n\n" + para).strip() if current else para

    if current.strip():
        chunks.append(current.strip())

    return chunks


def _hard_split(text: str, chunk_size: int, overlap: int, out: List[str]) -> str:
    """Fallback: cắt cứng theo sentence khi một paragraph quá dài."""
    sentences = _split_sentences(text)
    buf = ""
    for sent in sentences:
        if len(buf) + len(sent) + 1 > chunk_size:
            if buf:
                out.append(buf.strip())
                tail = buf[-overlap:] if overlap > 0 else ""
                buf = (tail + " " + sent).strip()
            else:
                # Câu đơn lẻ vẫn dài hơn chunk_size → cắt theo char
                for i in range(0, len(sent), chunk_size - overlap):
                    out.append(sent[i:i + chunk_size].strip())
                buf = ""
        else:
            buf = (buf + " " + sent).strip() if buf else sent
    return buf


def _split_sentences(text: str) -> List[str]:
    """Tách câu đơn giản theo dấu chấm/chấm hỏi/chấm than/xuống dòng."""
    import re
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip() for p in parts if p.strip()]


# ---------------------------------------------------------------------------
# Convenience — gọi 1 lần để parse + chunk
# ---------------------------------------------------------------------------
async def parse_and_chunk(document,
                    chunk_size: int = CHUNK_SIZE_CHARS,
                    overlap: int = CHUNK_OVERLAP_CHARS) -> List[str]:
    """
    Helper: trích xuất text → chunk → trả về list chunks.

    Đây là hàm router/service khác sẽ gọi trực tiếp khi tạo Assessment.
    """
    text = await extract_text(document)
    return chunk_text(text, chunk_size=chunk_size, overlap=overlap)
