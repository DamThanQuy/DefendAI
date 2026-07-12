"""Document router — Upload API.

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
from app.services.storage import save_doc

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# ===== Config =====
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".zip"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

EXTENSION_TO_DOCTYPE = {
    ".pdf": DocType.PDF,
    ".docx": DocType.DOCX,
    ".pptx": DocType.PPTX,
    ".zip": DocType.ZIP,
}

EXTENSION_TO_MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
}


def _get_doc_type(filename: str) -> DocType:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not supported. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    return EXTENSION_TO_DOCTYPE[ext]


def _sanitize_filename(filename: str) -> str:
    filename = os.path.basename(filename)
    filename = filename.replace("\x00", "")
    if not filename or filename.startswith("."):
        filename = "unnamed"
    stem = Path(filename).stem
    ext = Path(filename).suffix
    if len(filename) > 200:
        filename = stem[:200 - len(ext)] + ext
    return filename


def _determine_mime(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return EXTENSION_TO_MIME.get(ext, "application/octet-stream")


MAGIC_BYTES = {
    b"%PDF": ".pdf",
    b"PK\x03\x04": ".zip",
    b"\xd0\xcf\x11\xe0": ".doc",
    b"MZ": ".exe",
}


def _validate_magic_bytes(content: bytes, expected_ext: str) -> None:
    if len(content) < 4:
        return
    file_magic = content[:4]
    detected_ext = None
    for magic, ext in MAGIC_BYTES.items():
        if file_magic.startswith(magic):
            detected_ext = ext
            break
    if detected_ext == ".zip" and expected_ext in (".docx", ".pptx", ".zip"):
        return
    if detected_ext and detected_ext != expected_ext:
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match extension '{expected_ext}'. Detected: '{detected_ext}'",
        )


# ===== Endpoints =====


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(..., description="File upload (PDF/DOCX/PPTX/ZIP, max 100MB)"),
    db: AsyncSession = Depends(get_db),
):
    """Upload 1 file lên hệ thống."""
    doc_type = _get_doc_type(file.filename or "unknown")

    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty (0 bytes)")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    safe_filename = _sanitize_filename(file.filename or "unnamed")
    _validate_magic_bytes(content, Path(safe_filename).suffix.lower())

    storage_key = f"documents/{uuid.uuid4().hex[:16]}_{safe_filename}"
    await save_doc(storage_key, content, content_type=_determine_mime(safe_filename))

    doc = Document(
        filename=safe_filename,
        file_type=Path(safe_filename).suffix.lower(),
        doc_type=doc_type,
        storage_key=storage_key,
        status=DocumentStatus.uploaded,
    )
    db.add(doc)

    try:
        await db.commit()
        await db.refresh(doc)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save document metadata")

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
