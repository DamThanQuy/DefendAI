"""
Document router — Upload API.

Endpoints:
- POST /api/documents/upload  → upload file (multipart), validate type + size
- GET  /api/documents/{id}   → lấy metadata 1 file
- GET  /api/documents         → list tất cả files
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.models.entities import Document, DocType, DocumentStatus
from app.schemas.document import DocumentResponse, DocumentListResponse

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# ===== Config =====
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".zip"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

EXTENSION_TO_DOCTYPE = {
    ".pdf": DocType.PDF,
    ".docx": DocType.DOCX,
    ".pptx": DocType.PPTX,
    ".zip": DocType.ZIP,
}


def _get_doc_type(filename: str) -> DocType:
    """Map file extension -> DocType enum. Raise nếu extension không hỗ trợ."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    return EXTENSION_TO_DOCTYPE[ext]


def _sanitize_filename(filename: str) -> str:
    """Loại bỏ path traversal + truncate tên file."""
    # Lấy basename — loại bỏ path traversal (../, ..\\, /etc/passwd)
    filename = os.path.basename(filename)
    # Loại bỏ null bytes
    filename = filename.replace("\x00", "")
    # Loại bỏ tên rỗng sau sanitize
    if not filename or filename.startswith("."):
        filename = "unnamed"
    # Truncate nếu > 200 ký tự (giữ extension)
    stem = Path(filename).stem
    ext = Path(filename).suffix
    if len(filename) > 200:
        filename = stem[:200 - len(ext)] + ext
    return filename

# Magic bytes prefix cho file validation
MAGIC_BYTES = {
    b"%PDF": ".pdf",
    b"PK\x03\x04": ".zip",  # ZIP (bao gồm DOCX/PPTX cũng là ZIP-based)
    b"\xd0\xcf\x11\xe0": ".doc",  # OLE-based (legacy .doc/.ppt)
    b"MZ": ".exe",  # PE executable
}

def _validate_magic_bytes(content: bytes, expected_ext: str) -> None:
    """Kiểm tra magic bytes có khớp với extension không (basic check)."""
    if len(content) < 4:
        return  # File quá ngắn để check magic bytes
    file_magic = content[:4]
    detected_ext = None
    for magic, ext in MAGIC_BYTES.items():
        if file_magic.startswith(magic):
            detected_ext = ext
            break

    # DOCX/PPTX là ZIP-based nên detected_ext sẽ là ".zip" — skip check
    if detected_ext == ".zip" and expected_ext in (".docx", ".pptx", ".zip"):
        return

    # Nếu detect được magic bytes nhưng không khớp extension → reject
    if detected_ext and detected_ext != expected_ext:
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match extension '{expected_ext}'. Detected: '{detected_ext}'",
        )

def _save_file(file_content: bytes, filename: str) -> str:
    """Lưu file vào uploads/ với tên unique, trả về file path."""
    unique_name = f"{uuid.uuid4().hex[:12]}_{filename}"
    file_path = UPLOAD_DIR / unique_name
    file_path.write_bytes(file_content)
    return str(file_path)


# ===== Endpoints =====


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(..., description="File upload (PDF/DOCX/PPTX/ZIP, max 100MB)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload 1 file lên hệ thống.

    - Validate file extension (.pdf/.docx/.pptx/.zip)
    - Validate file size (max 100MB)
    - Lưu file vào uploads/ với tên unique
    - Tạo Document record trong DB
    """
    # Validate extension
    doc_type = _get_doc_type(file.filename or "unknown")

    # Read file content + validate size
    content = await file.read()

    # Validate empty file
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty (0 bytes)")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    # Validate magic bytes
    safe_filename = _sanitize_filename(file.filename or "unnamed")
    _validate_magic_bytes(content, Path(safe_filename).suffix.lower())

    # Lưu file
    file_path = _save_file(content, safe_filename)

    # Tạo DB record
    doc = Document(
        filename=safe_filename,
        file_type=Path(safe_filename).suffix.lower(),
        doc_type=doc_type,
        status=DocumentStatus.uploaded,
        file_path=file_path,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return doc


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    """Lấy metadata của 1 document theo ID."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    return doc


@router.get("/", response_model=DocumentListResponse)
async def list_documents(db: AsyncSession = Depends(get_db)):
    """List tất cả documents, sắp xếp mới nhất lên đầu."""
    result = await db.execute(select(Document).order_by(Document.created_at.desc()))
    docs = list(result.scalars().all())
    return DocumentListResponse(total=len(docs), items=docs)
