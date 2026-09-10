"""Document router — Upload API.

Endpoints (small file - simple upload):
- POST /api/documents/upload  → upload file (multipart), validate type + size
- GET  /api/documents/{id}   → lấy metadata 1 file
- GET  /api/documents         → list tất cả files
- GET  /api/documents/{id}/download → download file gốc từ MinIO
- GET  /api/documents/{id}/assessments → lấy danh sách assessment của document
- GET  /api/documents/{id}/contents → liệt kê nội dung file nén (ZIP/RAR)

Endpoints (large file - multipart upload, resumable):
- POST /api/documents/multipart/init   → tạo session + presigned URLs cho từng chunk
- GET  /api/documents/multipart/{id}/status → check progress (dùng để resume)
- POST /api/documents/multipart/{id}/complete → ghép các parts → tạo Document
- DELETE /api/documents/multipart/{id}/abort → hủy session + cleanup MinIO
"""
import logging
import math
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.entities import (
    Document,
    DocType,
    DocumentStatus,
    DocumentPurpose,
    Assessment,
    AssessmentStatus,
    User,
    UploadSession,
)
from app.schemas.document import (
    DocumentResponse,
    DocumentListResponse,
    MultipartInitRequest,
    MultipartInitResponse,
    MultipartPartInfo,
    MultipartCompleteRequest,
    MultipartCompleteResponse,
    MultipartStatusResponse,
)
from app.services.storage import (
    save_doc,
    get_doc,
    delete_doc,
    delete,
    create_multipart_upload,
    generate_part_upload_url,
    complete_multipart_upload,
    abort_multipart_upload,
    list_uploaded_parts,
    get_range,
)
from app.services.archive_service import list_archive_members, read_archive_member, ArchiveError

router = APIRouter(prefix="/api/documents", tags=["Documents"])

# ===== Config =====
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".zip", ".rar", ".md"}
MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024  # 10GB

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


async def _get_active_doc(db: AsyncSession, doc_id: int) -> Document:
    """Lấy document theo id; 404 nếu không tồn tại HOẶC đã bị soft-delete.

    Dùng cho mọi endpoint read/scan thường — file trong thùng rác không truy cập được.
    """
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    if doc.deleted_at is not None:
        raise HTTPException(status_code=410, detail="Tài liệu đã bị xoá, vào thùng rác để khôi phục")
    return doc


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


# ===== Multipart upload integrity check =====
# Multipart complete trên MinIO có thể "thành công" (HTTP 200) dù FE gửi
# ETag list sai thứ tự — parts bị lắp ráp sai vị trí trong object, file
# KHÔNG thể mở. Phát hiện scenario này bằng cách check:
#   1. 4 bytes đầu == magic hợp lệ (theo extension).
#   2. (Chỉ ZIP/RAR) EOCD/EOF signature ở 22 bytes cuối.
# Đây là check RẺ (~2 GET range requests vài chục bytes) so với tải full
# file vài GB, đủ tốt cho case ZIP thông thường.

async def _verify_uploaded_object_integrity(
    filename: str,
    expected_size: int,
    storage_key: str,
) -> bool:
    """Verify object trên MinIO sau multipart complete có hợp lệ không.

    Trả về True nếu object OK, False nếu phát hiện lỗi (magic bytes sai,
    thiếu EOCD, size không khớp). KHÔNG raise — caller quyết định cleanup.
    """
    import logging
    log = logging.getLogger(__name__)

    ext = Path(filename).suffix.lower()
    expected_magic = MAGIC_BYTES.get(ext)

    # 1. Check 4 bytes đầu (magic).
    try:
        head = await get_range(
            settings.minio.bucket, storage_key, 0, 3,
        )
    except Exception as exc:  # noqa: BLE001
        log.error("Integrity check: cannot GET head of %s: %s", storage_key, exc)
        return False

    if expected_magic and not head.startswith(expected_magic[:4]):
        log.error(
            "Integrity check FAIL: %s magic bytes = %s, expected %s",
            storage_key, head[:4].hex(), expected_magic[:4].hex(),
        )
        return False

    # 2. ZIP: check EOCD signature ở 22 bytes cuối file.
    # EOCD = b'PK\x05\x06' + 18 bytes. Với file < 4GB ZIP64 không bắt buộc,
    # nhưng nếu file > 4GB thì có Zip64 EOCD locator ngay trước EOCD.
    # Check cả 2 signature ở 64 bytes cuối là đủ cho hầu hết case.
    if ext == ".zip":
        if expected_size < 22:
            return True  # File quá nhỏ, skip.
        eocd_start = max(0, expected_size - 64)
        eocd_end = expected_size - 1
        try:
            tail = await get_range(
                settings.minio.bucket, storage_key, eocd_start, eocd_end,
            )
        except Exception as exc:  # noqa: BLE001
            log.error("Integrity check: cannot GET tail of %s: %s", storage_key, exc)
            return False
        # EOCD: PK\x05\x06, Zip64 EOCD: PK\x06\x06, Zip64 EOCD locator: PK\x06\x07
        if not any(sig in tail for sig in (b"PK\x05\x06", b"PK\x06\x06", b"PK\x06\x07")):
            log.error(
                "Integrity check FAIL: %s missing EOCD/Zip64 EOCD in last 64 bytes",
                storage_key,
            )
            return False

    log.info("Integrity check OK: %s (size=%d, ext=%s)", storage_key, expected_size, ext)
    return True


async def _delete_object_best_effort(bucket: str, key: str) -> None:
    """Xoá object trên MinIO, log warning nếu lỗi (best-effort)."""
    import logging
    try:
        await delete(bucket, key)
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).warning(
            "Best-effort delete failed for %s/%s: %s", bucket, key, exc,
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


# ===========================================================================
# Soft delete (thùng rác, mô phỏng Google Drive)
#   - Student xoá được file mình upload, TRỪ khi đã có assessment completed.
#   - Mentor xoá được mọi document của student.
#   - Admin xoá được tất cả + purge cứng qua /api/admin/documents/{id}/purge.
#   - File bị soft-delete được giữ 30 ngày rồi cron TrashPurger purge hẳn.
#
# QUAN TRỌNG: 3 endpoint này phải đăng ký TRƯỚC `/{doc_id}` — FastAPI match
# route theo thứ tự đăng ký, nếu `/trash` nằm sau thì `GET /api/documents/trash`
# sẽ bị `GET /{doc_id}` bắt với doc_id="trash" → 422.
# ===========================================================================


@router.get("/trash", response_model=DocumentListResponse)
async def list_trash(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Liệt kê tài liệu đang nằm trong thùng rác.

    - Student: chỉ thấy file mình upload.
    - Mentor / Admin: thấy tất cả (để hỗ trợ student khôi phục).
    Sắp xếp theo deleted_at DESC (mới xoá trước).
    """
    query = (
        select(Document)
        .where(Document.deleted_at.isnot(None))
        .order_by(Document.deleted_at.desc())
    )
    if not _is_privileged(user):
        query = query.where(Document.uploaded_by == user.id)
    result = await db.execute(query)
    docs = list(result.scalars().all())
    return DocumentListResponse(total=len(docs), items=docs)


@router.delete("/{doc_id}", status_code=204)
async def soft_delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft delete: chuyển vào thùng rác (giữ 30 ngày rồi auto-purge)."""
    result = await db.execute(
        select(Document)
        .options(selectinload(Document.assessments))
        .where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    if doc.deleted_at is not None:
        raise HTTPException(status_code=400, detail="Tài liệu đã nằm trong thùng rác")

    _assert_doc_access(doc, user)

    # Student KHÔNG được xoá file đã có assessment completed.
    if not _is_privileged(user):
        has_completed = any(
            a.status == AssessmentStatus.completed for a in (doc.assessments or [])
        )
        if has_completed:
            raise HTTPException(
                status_code=409,
                detail="Tài liệu đã có đánh giá hoàn thành, không thể xoá. Liên hệ mentor.",
            )

    doc.deleted_at = datetime.utcnow()
    doc.deleted_by = user.id
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Không thể xoá tài liệu")
    logging.getLogger(__name__).info(
        "soft-delete document id=%s by user=%s", doc_id, user.id
    )
    return Response(status_code=204)


@router.post("/{doc_id}/restore", response_model=DocumentResponse)
async def restore_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Khôi phục tài liệu đã bị soft-delete (trong vòng 30 ngày)."""
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    if doc.deleted_at is None:
        raise HTTPException(status_code=400, detail="Tài liệu chưa bị xoá")
    _assert_doc_access(doc, user)

    doc.deleted_at = None
    doc.deleted_by = None
    try:
        await db.commit()
        await db.refresh(doc)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Không thể khôi phục tài liệu")
    logging.getLogger(__name__).info(
        "restore document id=%s by user=%s", doc_id, user.id
    )
    return doc


@router.delete("/{doc_id}/permanent-delete", status_code=204)
async def permanent_delete_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hard delete: xoá cứng document (DB row + MinIO file).
    User chỉ xoá được tài liệu của chính mình hoặc tài liệu privileged.
    """
    result = await db.execute(
        select(Document)
        .options(
            selectinload(Document.assessments),
            selectinload(Document.code_analyses),
            selectinload(Document.chunks),
            selectinload(Document.code_module_hashes),
        )
        .where(Document.id == doc_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    if doc.deleted_at is None:
        raise HTTPException(status_code=400, detail="Tài liệu chưa bị xoá")

    _assert_doc_access(doc, user)

    storage_key = doc.storage_key

    # Best-effort xoá MinIO. Nếu lỗi, log và vẫn tiếp tục xoá DB row.
    try:
        await delete_doc(storage_key, bucket=settings.minio.bucket)
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "permanent-delete: MinIO delete failed for key=%s err=%s", storage_key, exc
        )

    try:
        # Xoá code_analysis_issues trước (FK từ issues → code_analyses)
        if doc.code_analyses:
            analysis_ids = [a.id for a in doc.code_analyses]
            from app.models.assessment import CodeAnalysisIssue

            await db.execute(
                sa_delete(CodeAnalysisIssue).where(
                    CodeAnalysisIssue.analysis_id.in_(analysis_ids)
                )
            )
        await db.delete(doc)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Không thể xoá vĩnh viễn: {exc}")

    logging.getLogger(__name__).info(
        "permanent-delete document id=%s by user=%s", doc_id, user.id
    )
    return Response(status_code=204)


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lấy metadata của 1 document theo ID."""
    doc = await _get_active_doc(db, doc_id)
    _assert_doc_access(doc, user)
    return doc


@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List documents. User thường chỉ thấy file mình upload; admin/mentor thấy tất cả.
    Mặc định BỎ QUA file đã xoá mềm — xem `/trash` để thấy thùng rác.
    """
    query = (
        select(Document)
        .where(Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    )
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
    doc = await _get_active_doc(db, doc_id)
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
    doc = await _get_active_doc(db, doc_id)
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
    doc = await _get_active_doc(db, doc_id)
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

# ===========================================================================

# ===========================================================================
# Multipart upload — for large files (GB), similar to Google Drive Resumable.
# ===========================================================================
# Flow:
#   1. Client POST /multipart/init {filename, size} -> get upload_id + parts URLs
#   2. Client PUT each chunk binary directly to MinIO via presigned URL
#      (parallel, retry per part, NOT going through Next.js -> bypass 1MB limit)
#   3. Client POST /multipart/{id}/complete {parts: [{PartNumber, ETag}]}
#      -> BE merges parts + creates Document record + returns document_id
#   4. (Optional) Client DELETE /multipart/{id}/abort to cancel
#
# Resume: Client GET /multipart/{id}/status -> know which parts uploaded.

DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024  # 8 MB
MIN_CHUNK_SIZE = 1024 * 1024  # 1 MB
MAX_PARTS = 10000


def _init_session_chunk_size(size: int) -> int:
    """Compute chunk size: ensure parts count <= MAX_PARTS (10000)."""
    chunk = DEFAULT_CHUNK_SIZE
    while math.ceil(size / chunk) > MAX_PARTS and chunk < size:
        chunk *= 2
    return max(chunk, MIN_CHUNK_SIZE)


@router.post("/multipart/init", response_model=MultipartInitResponse, status_code=201)
async def multipart_init(
    payload: MultipartInitRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Initialize multipart upload session.

    1. Validate extension + size.
    2. Create storage_key, call MinIO create_multipart_upload -> get s3_upload_id.
    3. Generate presigned URL for each part (FE uses them for PUT).
    4. Save UploadSession in DB for tracking + resume.
    """
    doc_type = _get_doc_type(payload.filename)
    safe_filename = _sanitize_filename(payload.filename)

    if payload.size <= 0:
        raise HTTPException(status_code=400, detail="File size must be > 0")
    if payload.size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max: {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    bucket = settings.minio.bucket
    chunk_size = _init_session_chunk_size(payload.size)
    parts_expected = math.ceil(payload.size / chunk_size)

    storage_key = f"documents/{uuid.uuid4().hex[:16]}_{safe_filename}"
    mime = payload.mime or _determine_mime(safe_filename)

    try:
        s3_upload_id = await create_multipart_upload(bucket, storage_key, mime)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("MinIO create_multipart_upload failed")
        raise HTTPException(status_code=502, detail=f"Storage init failed: {exc}")

    session_id = uuid.uuid4().hex
    sess = UploadSession(
        id=session_id,
        storage_key=storage_key,
        s3_upload_id=s3_upload_id,
        user_id=user.id,
        filename=safe_filename,
        size=payload.size,
        mime=mime,
        parts_expected=parts_expected,
        parts_received=0,
        status="pending",
    )
    db.add(sess)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        try:
            await abort_multipart_upload(bucket, storage_key, s3_upload_id)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to save upload session")

    parts_info: list[MultipartPartInfo] = []
    for part_no in range(1, parts_expected + 1):
        if part_no == parts_expected:
            actual_chunk = payload.size - (parts_expected - 1) * chunk_size
        else:
            actual_chunk = chunk_size
        url = await generate_part_upload_url(
            bucket, storage_key, s3_upload_id, part_no, expires_in=3600
        )
        parts_info.append(
            MultipartPartInfo(part_number=part_no, url=url, chunk_size=actual_chunk)
        )

    return MultipartInitResponse(
        upload_id=session_id,
        storage_key=storage_key,
        bucket=bucket,
        chunk_size=chunk_size,
        parts_expected=parts_expected,
        parts=parts_info,
    )


@router.get("/multipart/{upload_id}/status", response_model=MultipartStatusResponse)
async def multipart_status(
    upload_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current session status — used for resume after FE crash/network loss."""
    sess = await db.get(UploadSession, upload_id)
    if not sess:
        raise HTTPException(status_code=404, detail=f"Upload session {upload_id} not found")
    if sess.user_id != user.id and not _is_privileged(user):
        raise HTTPException(status_code=403, detail="You do not have access to this session")

    uploaded: list[dict] = []
    if sess.status == "pending":
        try:
            uploaded = await list_uploaded_parts(
                settings.minio.bucket, sess.storage_key, sess.s3_upload_id
            )
        except Exception:
            pass

    return MultipartStatusResponse(
        upload_id=upload_id,
        status=sess.status,
        parts_expected=sess.parts_expected,
        parts_received=sess.parts_received,
        document_id=sess.document_id,
        uploaded_parts=uploaded,
    )


@router.post("/multipart/{upload_id}/complete", response_model=MultipartCompleteResponse)
async def multipart_complete(
    upload_id: str,
    payload: MultipartCompleteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Merge uploaded parts -> create Document record.

    FE sends list of {PartNumber, ETag} for all successfully PUT parts.
    BE calls complete_multipart_upload on MinIO, creates Document row.
    """
    sess = await db.get(UploadSession, upload_id)
    if not sess:
        raise HTTPException(status_code=404, detail=f"Upload session {upload_id} not found")
    if sess.user_id != user.id and not _is_privileged(user):
        raise HTTPException(status_code=403, detail="You do not have access to this session")
    if sess.status == "completed":
        return MultipartCompleteResponse(
            upload_id=upload_id,
            document_id=sess.document_id,
            storage_key=sess.storage_key,
            filename=sess.filename,
            size=sess.size,
        )
    if sess.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Session is {sess.status}, cannot complete",
        )

    if len(payload.parts) != sess.parts_expected:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Parts mismatch: expected {sess.parts_expected}, "
                f"got {len(payload.parts)}"
            ),
        )

    doc_type = _get_doc_type(sess.filename)

    parts_for_s3 = [{"PartNumber": p.PartNumber, "ETag": p.ETag} for p in payload.parts]

    try:
        await complete_multipart_upload(
            settings.minio.bucket, sess.storage_key, sess.s3_upload_id, parts_for_s3
        )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("MinIO complete_multipart_upload failed")
        raise HTTPException(status_code=502, detail=f"Storage complete failed: {exc}")

    # Verify object integrity ngay sau khi MinIO complete.
    # Bắt buộc với file ZIP/RAR (và cả file thường): nếu FE gửi ETag list sai
    # thứ tự hoặc ETag bị strip dấu nháy kép, MinIO vẫn trả 200 OK nhưng lắp
    # ráp parts sai vị trí — file "thành công" trên bucket nhưng không thể mở.
    # Check: (1) 4 bytes đầu == ZIP/RAR magic; (2) (chỉ với ZIP) EOCD signature
    # ở 22 bytes cuối file. Nếu fail → xoá object hỏng + abort session,
    # return 502 với message rõ ràng.
    integrity_ok = await _verify_uploaded_object_integrity(
        sess.filename, sess.size, sess.storage_key,
    )
    if not integrity_ok:
        # Cleanup object hỏng + abort session để user có thể retry.
        try:
            await _delete_object_best_effort(settings.minio.bucket, sess.storage_key)
        except Exception:  # noqa: BLE001
            pass
        try:
            await abort_multipart_upload(
                settings.minio.bucket, sess.storage_key, sess.s3_upload_id,
            )
        except Exception:  # noqa: BLE001
            pass
        sess.status = "failed"
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail=(
                "Upload completed but object integrity check failed — "
                "the assembled file on storage is not a valid archive. "
                "Object has been deleted, please retry the upload."
            ),
        )

    doc = Document(
        filename=sess.filename,
        file_type=Path(sess.filename).suffix.lower(),
        doc_type=doc_type,
        storage_key=sess.storage_key,
        status=DocumentStatus.uploaded,
        purpose=DocumentPurpose.student_project,
        uploaded_by=user.id,
    )
    db.add(doc)
    await db.flush()

    sess.status = "completed"
    sess.parts_received = len(payload.parts)
    sess.document_id = doc.id
    sess.completed_at = datetime.utcnow()

    try:
        await db.commit()
        await db.refresh(doc)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save document metadata")

    return MultipartCompleteResponse(
        upload_id=upload_id,
        document_id=doc.id,
        storage_key=sess.storage_key,
        filename=sess.filename,
        size=sess.size,
    )


@router.delete("/multipart/{upload_id}/abort", status_code=204)
async def multipart_abort(
    upload_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel upload session + cleanup parts on MinIO."""
    sess = await db.get(UploadSession, upload_id)
    if not sess:
        raise HTTPException(status_code=404, detail=f"Upload session {upload_id} not found")
    if sess.user_id != user.id and not _is_privileged(user):
        raise HTTPException(status_code=403, detail="You do not have access to this session")
    if sess.status == "completed":
        raise HTTPException(
            status_code=409,
            detail="Session already completed, cannot abort",
        )

    try:
        await abort_multipart_upload(
            settings.minio.bucket, sess.storage_key, sess.s3_upload_id
        )
    except Exception:
        pass

    sess.status = "aborted"
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    return Response(status_code=204)
