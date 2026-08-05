"""Workspace router — gom nhiều file thành 1 đề tài.

Endpoints:
- GET    /api/workspaces/              → danh sách workspace của user
- POST   /api/workspaces/              → tạo workspace
- GET    /api/workspaces/{id}          → chi tiết workspace + files
- PATCH  /api/workspaces/{id}          → đổi tên
- DELETE /api/workspaces/{id}          → xoá workspace (không xoá documents)
- POST   /api/workspaces/{id}/files    → thêm file
- DELETE /api/workspaces/{id}/files/{document_id} → gỡ file
- GET    /api/workspaces/{id}/sessions → lịch sử phiên (assessments + code_analyses)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.entities import (
    User,
    Document,
    Assessment,
    CodeAnalysis,
    Workspace,
    WorkspaceFile,
)
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceRename,
    WorkspaceFileAdd,
    WorkspaceListResponse,
    WorkspaceOut,
    WorkspaceFileOut,
    WorkspaceSessionsResponse,
    SessionItem,
)

router = APIRouter(prefix="/api/workspaces", tags=["Workspaces"])


# ===== Helpers =====


async def _get_owned_workspace(
    workspace_id: int, user: User, db: AsyncSession
) -> Workspace:
    """Lấy workspace thuộc về user — chặn truy cập chéo user khác."""
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.files).selectinload(WorkspaceFile.document))
        .where(Workspace.id == workspace_id, Workspace.user_id == user.id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace không tồn tại")
    return workspace


def _to_workspace_out(workspace: Workspace) -> WorkspaceOut:
    files = [
        WorkspaceFileOut(
            document_id=wf.document_id,
            filename=wf.document.filename,
            file_type=wf.document.file_type,
            doc_type=wf.document.doc_type,
            role=wf.role,
            added_at=wf.added_at,
        )
        for wf in sorted(workspace.files, key=lambda f: f.added_at)
    ]
    return WorkspaceOut(
        id=workspace.id,
        name=workspace.name,
        created_at=workspace.created_at,
        document_count=len(files),
        files=files,
    )


# ===== Endpoints =====


@router.get("/", response_model=WorkspaceListResponse)
async def list_workspaces(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách workspace của user (kèm files + document_count)."""
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.files).selectinload(WorkspaceFile.document))
        .where(Workspace.user_id == user.id)
        .order_by(Workspace.created_at.desc())
    )
    workspaces = list(result.scalars().all())
    return WorkspaceListResponse(
        total=len(workspaces),
        items=[_to_workspace_out(w) for w in workspaces],
    )


@router.post("/", response_model=WorkspaceOut, status_code=201)
async def create_workspace(
    req: WorkspaceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Tạo workspace mới."""
    workspace = Workspace(name=req.name.strip(), user_id=user.id)
    db.add(workspace)
    try:
        await db.commit()
        await db.refresh(workspace)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Không thể tạo workspace")
    # Workspace mới chưa có file — trả trực tiếp, tránh lazy-load relationship
    return WorkspaceOut(
        id=workspace.id,
        name=workspace.name,
        created_at=workspace.created_at,
        document_count=0,
        files=[],
    )


@router.get("/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chi tiết workspace + files."""
    workspace = await _get_owned_workspace(workspace_id, user, db)
    return _to_workspace_out(workspace)


@router.patch("/{workspace_id}", response_model=WorkspaceOut)
async def rename_workspace(
    workspace_id: int,
    req: WorkspaceRename,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Đổi tên workspace."""
    workspace = await _get_owned_workspace(workspace_id, user, db)
    workspace.name = req.name.strip()
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Không thể đổi tên workspace")
    # Re-fetch để nạp files relationship (tránh lazy-load trong async)
    workspace = await _get_owned_workspace(workspace_id, user, db)
    return _to_workspace_out(workspace)


@router.delete("/{workspace_id}", status_code=204)
async def delete_workspace(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Xoá workspace — KHÔNG xoá documents (chỉ xoá liên kết)."""
    workspace = await _get_owned_workspace(workspace_id, user, db)
    await db.delete(workspace)
    await db.commit()


@router.post("/{workspace_id}/files", response_model=WorkspaceOut, status_code=201)
async def add_workspace_file(
    workspace_id: int,
    req: WorkspaceFileAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Thêm file vào workspace. 1 file có thể thuộc nhiều workspace."""
    workspace = await _get_owned_workspace(workspace_id, user, db)

    result = await db.execute(select(Document).where(Document.id == req.document_id))
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail=f"Document {req.document_id} không tồn tại")

    role = req.role if req.role in {"main", "attachment"} else "main"
    # Idempotent: nếu file đã có trong workspace → trả về nguyên trạng (không lỗi 409)
    # Vì UI "Thêm vào workspace" (trang documents) không biết workspace đã chứa file nào.
    if any(wf.document_id == req.document_id for wf in workspace.files):
        return _to_workspace_out(workspace)

    workspace.files.append(WorkspaceFile(document_id=req.document_id, role=role))
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Không thể thêm file vào workspace")

    workspace = await _get_owned_workspace(workspace_id, user, db)
    return _to_workspace_out(workspace)


@router.delete("/{workspace_id}/files/{document_id}", response_model=WorkspaceOut)
async def remove_workspace_file(
    workspace_id: int,
    document_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Gỡ file khỏi workspace (không xoá file gốc)."""
    workspace = await _get_owned_workspace(workspace_id, user, db)
    target = next((wf for wf in workspace.files if wf.document_id == document_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="File không có trong workspace này")

    await db.delete(target)
    await db.commit()
    workspace = await _get_owned_workspace(workspace_id, user, db)
    return _to_workspace_out(workspace)


@router.get("/{workspace_id}/sessions", response_model=WorkspaceSessionsResponse)
async def workspace_sessions(
    workspace_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lịch sử phiên của workspace: assessments (câu hỏi) + code_analyses (review)."""
    workspace = await _get_owned_workspace(workspace_id, user, db)
    doc_ids = [wf.document_id for wf in workspace.files]

    if not doc_ids:
        return WorkspaceSessionsResponse(
            workspace_id=workspace_id, workspace_name=workspace.name
        )

    # Tên document để FE hiển thị nguồn
    doc_result = await db.execute(select(Document).where(Document.id.in_(doc_ids)))
    doc_names = {d.id: d.filename for d in doc_result.scalars().all()}

    assessments = []
    a_result = await db.execute(
        select(Assessment)
        .where(Assessment.document_id.in_(doc_ids))
        .order_by(Assessment.created_at.desc())
    )
    for a in a_result.scalars().all():
        assessments.append(
            SessionItem(
                id=a.id,
                document_id=a.document_id,
                document_name=doc_names.get(a.document_id, "Unknown"),
                persona=a.persona,
                status=a.status.value,
                created_at=a.created_at,
            )
        )

    code_analyses = []
    c_result = await db.execute(
        select(CodeAnalysis)
        .where(CodeAnalysis.document_id.in_(doc_ids))
        .order_by(CodeAnalysis.created_at.desc())
    )
    for c in c_result.scalars().all():
        code_analyses.append(
            SessionItem(
                id=c.id,
                document_id=c.document_id,
                document_name=doc_names.get(c.document_id, "Unknown"),
                status="completed",
                pass_rate=c.pass_rate,
                issue_count=len(c.issues or []),
                created_at=c.created_at,
            )
        )

    return WorkspaceSessionsResponse(
        workspace_id=workspace_id,
        workspace_name=workspace.name,
        assessments=assessments,
        code_analyses=code_analyses,
    )
