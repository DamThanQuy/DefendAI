"""Router use_cases — quản lý cam kết Use Case từ SRS (BR-B2).

Endpoints:
  GET  /api/use-cases/workspaces/{ws_id}     — list UC của workspace
  GET  /api/use-cases/workspaces/{ws_id}/stats — thống kê (total, completed, ratio)
  POST /api/use-cases/workspaces/{ws_id}/extract — AI trích UC từ Document SRS
                                                    (manual trigger)
  POST /api/use-cases/workspaces/{ws_id}     — thêm 1 UC thủ công
  PATCH /api/use-cases/{uc_id}               — sửa (status, name, transactions_est, note)
  DELETE /api/use-cases/{uc_id}              — xoá (ghi audit)

Quyền:
  - extract / list / stats: thành viên workspace (owner) HOẶC admin/mentor
  - insert / update / delete: chỉ owner workspace HOẶC admin/mentor
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.user import User
from app.models.use_case_commitment import (
    UCSource,
    UCStatus,
    UseCaseCommitment,
    UseCaseCommitmentAudit,
)
from app.models.workspace import Workspace
from app.services.use_case_extractor import extract_use_cases_from_document
from app.services.use_case_mapper import get_workspace_uc_stats

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/use-cases", tags=["Use Cases (BR-B2)"])


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------
async def _load_workspace(db: AsyncSession, workspace_id: int) -> Workspace:
    ws = (await db.execute(
        select(Workspace).where(Workspace.id == workspace_id)
    )).scalar_one_or_none()
    if not ws:
        raise HTTPException(status_code=404, detail=f"Workspace {workspace_id} không tồn tại")
    return ws


def _is_privileged(user: User) -> bool:
    """Admin/mentor luôn có quyền (mọi workspace)."""
    names = {r.name for r in user.roles}
    return bool(names & {"admin", "mentor"})


def _can_write(user: User, ws: Workspace) -> bool:
    if _is_privileged(user):
        return True
    return ws.user_id == user.id


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class UseCaseOut(BaseModel):
    id: int
    workspace_id: int
    uc_code: str
    name: str
    actor: Optional[str] = None
    status: str
    transactions_est: Optional[int] = None
    source: str
    source_document_id: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UseCaseCreate(BaseModel):
    uc_code: str = Field(..., min_length=1, max_length=40, description="Mã UC (UC01, UC-Login...)")
    name: str = Field(..., min_length=1, max_length=255)
    actor: Optional[str] = Field(default=None, max_length=100)
    status: str = Field(default=UCStatus.committed.value, description="committed|completed|omitted")
    transactions_est: Optional[int] = Field(default=None, ge=1, le=50)
    note: Optional[str] = None


class UseCaseUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    actor: Optional[str] = Field(default=None, max_length=100)
    status: Optional[str] = Field(default=None, description="committed|completed|omitted")
    transactions_est: Optional[int] = Field(default=None, ge=1, le=50)
    note: Optional[str] = None


class ExtractRequest(BaseModel):
    document_id: int = Field(..., description="ID của Document SRS đã upload")
    replace_existing: bool = Field(
        default=False,
        description="Nếu True, XÓA mọi UC cũ (giữ audit) trước khi insert UC mới",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_code(code: str) -> str:
    """Upper + bỏ whitespace giữa, case-insensitive cho cùng 1 UC."""
    import re
    return re.sub(r"\s+", "", code).upper()[:40]


def _validate_status(value: str) -> str:
    if value not in {s.value for s in UCStatus}:
        raise HTTPException(
            status_code=422,
            detail=f"status phải là một trong: {sorted(s.value for s in UCStatus)}",
        )
    return value


def _to_out(uc: UseCaseCommitment) -> UseCaseOut:
    return UseCaseOut.model_validate(uc)


def _snapshot(uc: UseCaseCommitment) -> str:
    return json.dumps(
        {
            "id": uc.id,
            "workspace_id": uc.workspace_id,
            "uc_code": uc.uc_code,
            "name": uc.name,
            "actor": uc.actor,
            "status": uc.status,
            "transactions_est": uc.transactions_est,
            "source": uc.source,
            "source_document_id": uc.source_document_id,
            "note": uc.note,
        },
        ensure_ascii=False,
    )


def _write_audit(
    db: AsyncSession,
    *,
    commitment_id: int,
    action: str,
    actor_id: int,
    before: Optional[UseCaseCommitment] = None,
    after: Optional[UseCaseCommitment] = None,
) -> None:
    db.add(UseCaseCommitmentAudit(
        commitment_id=commitment_id,
        action=action,
        actor_id=actor_id,
        before=_snapshot(before) if before else None,
        after=_snapshot(after) if after else None,
    ))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get(
    "/workspaces/{workspace_id}/stats",
    summary="Thống kê UC của workspace (BR-B2 + rules engine)",
)
async def get_stats(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    await _load_workspace(db, workspace_id)
    stats = await get_workspace_uc_stats(db, workspace_id)
    return stats.to_dict()


@router.get(
    "/workspaces/{workspace_id}",
    response_model=list[UseCaseOut],
    summary="Danh sách UC của workspace",
)
async def list_use_cases(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UseCaseOut]:
    await _load_workspace(db, workspace_id)
    rows = (await db.execute(
        select(UseCaseCommitment)
        .where(UseCaseCommitment.workspace_id == workspace_id)
        .order_by(UseCaseCommitment.uc_code.asc())
    )).scalars().all()
    return [_to_out(r) for r in rows]


@router.post(
    "/workspaces/{workspace_id}/extract",
    response_model=list[UseCaseOut],
    summary="AI trích Use Case từ Document SRS (manual trigger)",
    description=(
        "Đọc Document, chạy parse + chunk, gọi AI provider → lưu UC vào DB. "
        "SV sửa lại sau qua PATCH (audit log đầy đủ). "
        "Mặc định KHÔNG xoá UC cũ (idempotent append); đặt replace_existing=true để replace."
    ),
)
async def extract_use_cases(
    workspace_id: int,
    req: ExtractRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "mentor", "student")),
) -> list[UseCaseOut]:
    ws = await _load_workspace(db, workspace_id)
    if not _can_write(user, ws):
        raise HTTPException(status_code=403, detail="Chỉ owner workspace hoặc admin/mentor")

    try:
        result = await extract_use_cases_from_document(db, req.document_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    use_cases = result.get("use_cases", [])
    if not use_cases:
        return []  # Caller sẽ thấy list rỗng (đã có warning ở result)

    # Replace mode: xoá UC cũ (giữ audit, snapshot before)
    if req.replace_existing:
        old = (await db.execute(
            select(UseCaseCommitment).where(UseCaseCommitment.workspace_id == workspace_id)
        )).scalars().all()
        for o in old:
            _write_audit(db, commitment_id=o.id, action="delete", actor_id=user.id, before=o)
            await db.delete(o)
        await db.flush()

    # Lấy UC cũ (nếu không replace) để chống trùng mã
    existing_codes: set[str] = set()
    if not req.replace_existing:
        existing_codes = {
            r.uc_code
            for r in (await db.execute(
                select(UseCaseCommitment.uc_code).where(
                    UseCaseCommitment.workspace_id == workspace_id
                )
            )).scalars().all()
        }

    inserted: list[UseCaseCommitment] = []
    for uc in use_cases:
        code = _normalize_code(uc["uc_code"])
        if code in existing_codes:
            continue  # idempotent: skip
        row = UseCaseCommitment(
            workspace_id=workspace_id,
            uc_code=code,
            name=uc["name"],
            actor=uc.get("actor"),
            status=UCStatus.committed.value,
            transactions_est=uc.get("transactions_est"),
            source=UCSource.ai_extracted.value,
            source_document_id=req.document_id,
        )
        db.add(row)
        await db.flush()  # lấy id
        _write_audit(db, commitment_id=row.id, action="insert", actor_id=user.id, after=row)
        inserted.append(row)
        existing_codes.add(code)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Trùng mã UC trong workspace: {exc.orig}") from exc
    for r in inserted:
        await db.refresh(r)
    return [_to_out(r) for r in inserted]


@router.post(
    "/workspaces/{workspace_id}",
    response_model=UseCaseOut,
    status_code=201,
    summary="Thêm UC thủ công vào workspace",
)
async def add_manual(
    workspace_id: int,
    req: UseCaseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "mentor", "student")),
) -> UseCaseOut:
    ws = await _load_workspace(db, workspace_id)
    if not _can_write(user, ws):
        raise HTTPException(status_code=403, detail="Chỉ owner workspace hoặc admin/mentor")

    code = _normalize_code(req.uc_code)
    status = _validate_status(req.status)
    row = UseCaseCommitment(
        workspace_id=workspace_id,
        uc_code=code,
        name=req.name,
        actor=req.actor,
        status=status,
        transactions_est=req.transactions_est,
        source=UCSource.manual.value,
        note=req.note,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"UC mã '{code}' đã tồn tại trong workspace này",
        ) from exc
    await db.refresh(row)
    _write_audit(db, commitment_id=row.id, action="insert", actor_id=user.id, after=row)
    await db.commit()
    return _to_out(row)


@router.patch(
    "/{uc_id}",
    response_model=UseCaseOut,
    summary="Sửa UC (status / name / transactions / note) — có audit",
)
async def update_use_case(
    uc_id: int,
    req: UseCaseUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "mentor", "student")),
) -> UseCaseOut:
    row = (await db.execute(
        select(UseCaseCommitment).where(UseCaseCommitment.id == uc_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"UC {uc_id} không tồn tại")
    ws = await _load_workspace(db, row.workspace_id)
    if not _can_write(user, ws):
        raise HTTPException(status_code=403, detail="Chỉ owner workspace hoặc admin/mentor")

    before = UseCaseCommitment(
        id=row.id, workspace_id=row.workspace_id, uc_code=row.uc_code,
        name=row.name, actor=row.actor, status=row.status,
        transactions_est=row.transactions_est, source=row.source,
        source_document_id=row.source_document_id, note=row.note,
    )

    if req.name is not None:
        row.name = req.name
    if req.actor is not None:
        row.actor = req.actor
    if req.status is not None:
        row.status = _validate_status(req.status)
    if req.transactions_est is not None:
        row.transactions_est = req.transactions_est
    if req.note is not None:
        row.note = req.note
    row.updated_at = datetime.utcnow()

    _write_audit(db, commitment_id=row.id, action="update", actor_id=user.id,
                 before=before, after=row)
    await db.commit()
    await db.refresh(row)
    return _to_out(row)


@router.delete(
    "/{uc_id}",
    status_code=204,
    summary="Xoá UC (ghi audit)",
)
async def delete_use_case(
    uc_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "mentor", "student")),
) -> None:
    row = (await db.execute(
        select(UseCaseCommitment).where(UseCaseCommitment.id == uc_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"UC {uc_id} không tồn tại")
    ws = await _load_workspace(db, row.workspace_id)
    if not _can_write(user, ws):
        raise HTTPException(status_code=403, detail="Chỉ owner workspace hoặc admin/mentor")
    _write_audit(db, commitment_id=row.id, action="delete", actor_id=user.id, before=row)
    await db.delete(row)
    await db.commit()
