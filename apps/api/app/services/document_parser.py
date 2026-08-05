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
import zipfile
from typing import List

from PyPDF2 import PdfReader
from docx import Document as DocxDocument
from pptx import Presentation

from app.models.document import DocType, Document
from app.services.storage import get_doc

try:
    import rarfile
except ImportError:  # pragma: no cover
    rarfile = None  # type: ignore

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


def _extract_md(src) -> str:
    """Trích xuất text từ Markdown. Plain text, bỏ qua markup."""
    import io
    content = src.read() if isinstance(src, io.IOBase) else open(src, "rb").read()
    raw = content.decode("utf-8", errors="replace")
    return raw.strip()


# File extensions đọc được text trong archive (code + text + office docs)
TEXT_EXTENSIONS = {
    # code
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rb", ".php", ".cs",
    ".cpp", ".c", ".h", ".hpp", ".html", ".css", ".json", ".yml", ".yaml",
    ".xml", ".toml", ".ini", ".cfg", ".conf", ".sh", ".bat", ".ps1", ".sql",
    ".dockerfile", ".makefile", ".env", ".properties",
    # text / markdown
    ".md", ".markdown", ".txt", ".rst", ".log",
}
# Office docs trong archive: extract riêng theo từng loại
OFFICE_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx"}
# Archive con lồng nhau (đọc đệ quy)
NESTED_ARCHIVE_EXTENSIONS = {".zip", ".rar"}

MAX_ARCHIVE_MEMBERS = 500
MAX_ARCHIVE_TOTAL_TEXT = 200 * 1024 * 1024  # 200MB text tổng


def _extract_zip(src) -> str:
    """Trích xuất text từ ZIP: đọc mọi file text/code/office bên trong rồi ghép lại.

    Mỗi member được đánh dấu bằng header "### <path>" để AI biết nội dung từ đâu.
    Nhận str path, bytes hoặc file-like object (như các extractor khác).
    """
    data = src if isinstance(src, bytes) else src.read()
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            infos = [i for i in archive.infolist() if not i.is_dir()]
            if len(infos) > MAX_ARCHIVE_MEMBERS:
                raise DocumentParserError(
                    f"ZIP chứa quá nhiều file ({len(infos)} > {MAX_ARCHIVE_MEMBERS})"
                )
            parts: List[str] = []
            total = 0
            for info in infos:
                name = info.filename
                ext = name.split(".")[-1].lower() if "." in name else ""
                ext = f".{ext}"
                total += info.file_size
                if total > MAX_ARCHIVE_TOTAL_TEXT:
                    break
                try:
                    raw = archive.read(info)
                except Exception:
                    continue  # member lỗi thì bỏ qua, không chặn cả file
                text = _extract_member_text(raw, name, ext)
                if text:
                    parts.append(f"### {name}\n{text}")
            return "\n\n".join(parts).strip()
    except zipfile.BadZipFile as exc:
        raise DocumentParserError("File ZIP bị lỗi hoặc không thể giải nén") from exc


def _extract_rar(data: bytes) -> str:
    """Trích xuất text từ RAR (nếu có rarfile), tương tự _extract_zip."""
    if rarfile is None:
        raise DocumentParserError("Chưa cài thư viện rarfile để đọc file .rar")
    try:
        with rarfile.RarFile(BytesIO(data)) as archive:
            infos = [i for i in archive.infolist() if not i.isdir()]
            if len(infos) > MAX_ARCHIVE_MEMBERS:
                raise DocumentParserError(
                    f"RAR chứa quá nhiều file ({len(infos)} > {MAX_ARCHIVE_MEMBERS})"
                )
            parts: List[str] = []
            total = 0
            for info in infos:
                name = info.filename
                ext = name.split(".")[-1].lower() if "." in name else ""
                ext = f".{ext}"
                total += info.file_size
                if total > MAX_ARCHIVE_TOTAL_TEXT:
                    break
                try:
                    raw = archive.read(name)
                except Exception:
                    continue
                text = _extract_member_text(raw, name, ext)
                if text:
                    parts.append(f"### {name}\n{text}")
            return "\n\n".join(parts).strip()
    except (rarfile.RarCannotExec, rarfile.Error) as exc:
        raise DocumentParserError(f"File RAR bị lỗi hoặc không thể giải nén: {exc}") from exc


def _extract_member_text(raw: bytes, name: str, ext: str) -> str:
    """Trích text 1 member trong archive theo extension."""
    try:
        if ext in OFFICE_EXTENSIONS:
            if ext == ".pdf":
                return _extract_pdf(BytesIO(raw))
            if ext == ".docx":
                return _extract_docx(BytesIO(raw))
            if ext == ".pptx":
                return _extract_pptx(BytesIO(raw))
            if ext == ".xlsx":
                return _extract_xlsx(BytesIO(raw))
        if ext in NESTED_ARCHIVE_EXTENSIONS:
            return _extract_zip(raw) if ext == ".zip" else _extract_rar(raw)
        if ext in TEXT_EXTENSIONS or ext == "":
            return raw.decode("utf-8", errors="replace").strip()
    except Exception:
        logger.debug("Skip member %s: %s", name, exc_info=True)
    return ""


def _extract_archive(src) -> str:
    """Nhận ZIP hoặc RAR, tự detect theo magic bytes và dispatch."""
    data = src if isinstance(src, bytes) else src.read()
    if data[:8].startswith(b"Rar!\x1a\x07"):
        return _extract_rar(data)
    return _extract_zip(data)


def _extract_xlsx(src) -> str:
    """Trích xuất text từ XLSX (openpyxl nếu có, không thì bỏ qua)."""
    try:
        from openpyxl import load_workbook
        wb = load_workbook(BytesIO(src.read()) if isinstance(src, BytesIO) else src, read_only=True, data_only=True)
    except Exception:
        return ""
    rows: List[str] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            vals = [str(c) for c in row if c is not None and str(c).strip()]
            if vals:
                rows.append("\t".join(vals))
    return "\n".join(rows).strip()


_EXTRACTORS = {
    DocType.PDF: _extract_pdf,
    DocType.DOCX: _extract_docx,
    DocType.PPTX: _extract_pptx,
    DocType.ZIP: _extract_archive,
    # .md mapped to DocType.PDF via router, handle via filename fallback below
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
    storage_key = document.storage_key
    if not storage_key:
        raise DocumentParserError(f"Document {document.id} has no storage key")

    try:
        data = await get_doc(storage_key)
    except Exception as exc:
        logger.exception("Failed to download %s from MinIO", storage_key)
        raise DocumentParserError(f"Download failed for {storage_key}: {exc}") from exc

    # Detect markdown/text files by extension
    if storage_key.lower().endswith(".md"):
        text = data.decode("utf-8", errors="replace").strip()
        if len(text) < MIN_TEXT_LENGTH_WARN:
            logger.warning("Extracted text is suspiciously short (%s chars) from %s", len(text), storage_key)
        return text

    extractor = _EXTRACTORS.get(document.doc_type)
    if extractor is None:
        raise DocumentParserError(f"Unsupported doc_type: {document.doc_type}")

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
