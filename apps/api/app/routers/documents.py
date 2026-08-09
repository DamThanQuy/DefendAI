"""Document router — Upload API.

Endpoints:
- POST /api/documents/upload  → upload file (multipart), validate type + size
- GET  /api/documents/{id}   → lấy metadata 1 file
- GET  /api/documents         → list tất cả files
- GET  /api/documents/{id}/download → download file gốc từ MinIO
- GET  /api/documents/{id}/assessments → lấy danh sách assessment của document
- GET  /api/documents/{id}/contents → liệt kê nội dung file nén (ZIP/RAR)
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.entities import Document, DocType, DocumentStatus, DocumentPurpose, Assessment, User
from app.schemas.document import DocumentResponse, DocumentListResponse
from app.services.storage import save_doc, get_doc
from app.services.archive_service import list_archive_members, read_archive_member, ArchiveError

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# ===== Config =====
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".zip", ".rar", ".md"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

EXTENSION_TO_DOCTYPE = {
    ".pdf": DocType.PDF,
    ".docx": DocType.DOCX,
    ".pptx": DocType.PPTX,
    ".zip": DocType.ZIP,
    ".rar": DocType.ZIP,  # treat rar as ZIP-type (archive chứa source code)
    ".md": DocType.PDF,  # treat md as PDF-type (text-based)
}

EXTENSION_TO_MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".md": "text/markdown",
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

def _is_privileged(user: User) -> bool:
    """Admin / Mentor được xem tất cả documents."""
    return bool({r.name for r in user.roles} & {"admin", "mentor"})

def _assert_doc_access(doc: Document, user: User) -> None:
    """Chỉ chủ sở hữu (uploaded_by) hoặc admin/mentor mới truy cập được."""
    if _is_privileged(user):
        return
    if doc.uploaded_by is None or doc.uploaded_by != user.id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập tài liệu này")


MAGIC_BYTES = {
    b"%PDF": ".pdf",
    b"PK\x03\x04": ".zip",
    b"Rar!\x1a\x07\x00": ".rar",  # RAR 4.x
    b"Rar!\x1a\x07\x01\x00": ".rar",  # RAR 5.x
    b"\xd0\xcf\x11\xe0": ".doc",
    b"MZ": ".exe",
}


def _validate_magic_bytes(content: bytes, expected_ext: str) -> None:
    if len(content) < 4:
        return
    file_magic = content[:8]
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
    purpose: DocumentPurpose = Form(DocumentPurpose.student_project, description="student_project / staff_reference"),
    user: User = Depends(get_current_user),
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
        purpose=purpose,
        uploaded_by=user.id,
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
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lấy metadata của 1 document theo ID."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    _assert_doc_access(doc, user)
    return doc


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List documents. User thường chỉ thấy file mình upload; admin/mentor thấy tất cả."""
    query = select(Document).order_by(Document.created_at.desc())
    if not _is_privileged(user):
        query = query.where(Document.uploaded_by == user.id)
    result = await db.execute(query)
    docs = list(result.scalars().all())
    return DocumentListResponse(total=len(docs), items=docs)


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download file gốc từ MinIO."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    _assert_doc_access(doc, user)

    try:
        data = await get_doc(doc.storage_key)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read file from storage")

    return Response(
        content=data,
        media_type=_determine_mime(doc.filename),
        headers={
            "Content-Disposition": f'attachment; filename="{doc.filename}"',
            "Content-Length": str(len(data)),
        },
    )


@router.get("/{doc_id}/assessments")
async def list_document_assessments(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lấy danh sách assessment của 1 document."""
    result = await db.execute(
        select(Assessment)
        .where(Assessment.document_id == doc_id)
        .order_by(Assessment.created_at.desc())
    )
    assessments = list(result.scalars().all())
    return {
        "total": len(assessments),
        "items": [
            {
                "id": a.id,
                "persona": a.persona,
                "status": a.status.value,
                "chunks_count": len(a.chunks or []),
                "questions_count": len(a.questions or []),
                "created_at": a.created_at.isoformat(),
            }
            for a in assessments
        ],
    }


@router.get("/{doc_id}/contents")
async def list_document_contents(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Liệt kê toàn bộ file/folder trong ZIP/RAR như cây thư mục."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    _assert_doc_access(doc, user)

    if doc.doc_type != DocType.ZIP:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ xem nội dung file ZIP/RAR")

    try:
        members = await list_archive_members(doc)
    except ArchiveError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "document_id": doc_id,
        "filename": doc.filename,
        "total": len(members),
        "items": [
            {"path": m.path, "size": m.size, "is_dir": m.is_dir}
            for m in members
        ],
    }


@router.get("/{doc_id}/contents/{member_path:path}")
async def get_document_member_content(
    doc_id: int,
    member_path: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Đọc nội dung 1 file bên trong ZIP/RAR (bytes gốc, kèm content-type)."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    _assert_doc_access(doc, user)

    try:
        data = await read_archive_member(doc, member_path)
    except ArchiveError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ext = Path(member_path).suffix.lower()
    mime = EXTENSION_TO_MIME.get(ext, "application/octet-stream")
    # File text → UTF-8 để FE render preview đúng (đặc biệt tiếng Việt)
    if ext in {".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go", ".rb", ".php",
               ".cs", ".cpp", ".c", ".h", ".html", ".css", ".json", ".yml", ".yaml",
               ".md", ".txt", ".xml", ".sh", ".sql", ".ini", ".toml", ".env"}:
        mime = "text/plain; charset=utf-8"

    return Response(
        content=data,
        media_type=mime,
        headers={
            "Content-Disposition": f'inline; filename="{Path(member_path).name}"',
            "Content-Length": str(len(data)),
        },
    )
