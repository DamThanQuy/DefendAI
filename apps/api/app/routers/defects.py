"""Router defects (BR-B3) — thống kê + override severity.

Endpoints:
  GET  /api/defects/workspaces/{ws_id}/stats   — n_showstopper / n_logic / n_minor per workspace
  PATCH /api/defects/issues/{issue_id}/severity — mentor override severity (audit log)

Quyền:
  - stats: owner workspace HOẶC admin/mentor
  - override severity: admin/mentor (ghi audit)
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.assessment import CodeAnalysisIssue
from app.models.defect_severity import (
    AuditCodeAnalysisIssue,
    DefectSeverity,
    map_legacy_severity,
)
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceFile
from app.services.defect_counter import get_workspace_defect_stats

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/defects", tags=["Defects (BR-B3)"])


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
    return bool({r.name for r in user.roles} & {"admin", "mentor"})


def _can_read(user: User, ws: Workspace) -> bool:
    if _is_privileged(user):
        return True
    return ws.user_id == user.id


def _validate_severity(value: str) -> str:
    """Chấp nhận cả giá trị mới (show_stopper/logic/minor) lẫn legacy
    (critical/high/medium/low/info) — map legacy → mới trước khi lưu.
    """
    direct = {s.value for s in DefectSeverity}
    if value in direct:
        return value
    mapped = map_legacy_severity(value)
    if mapped is None:
        supported = sorted(direct) + ["critical", "high", "medium", "low", "info"]
        raise HTTPException(
            status_code=422,
            detail=(
                f"severity không hợp lệ '{value}'. Hỗ trợ: {supported}"
            ),
        )
    return mapped.value


def _snapshot(issue: CodeAnalysisIssue) -> str:
    return json.dumps(
        {
            "id": issue.id,
            "analysis_id": issue.analysis_id,
            "file": issue.file,
            "line": issue.line,
            "type": issue.type,
            "severity": issue.severity,
            "description": issue.description,
        },
        ensure_ascii=False,
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class DefectStatsOut(BaseModel):
    workspace_id: int
    total: int
    n_showstopper: int
    n_logic: int
    n_minor: int
    legacy_breakdown: dict[str, int] = Field(
        default_factory=dict,
        description="Phân bố theo severity gốc (debug)",
    )

    class Config:
        from_attributes = True


class SeverityOverrideIn(BaseModel):
    severity: str = Field(
        ...,
        description="DefectSeverity mới: show_stopper | logic | minor (hoặc legacy)",
    )
    reason: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Lý do override (ghi vào audit, không bắt buộc)",
    )


class SeverityOverrideOut(BaseModel):
    id: int
    analysis_id: int
    file: str
    line: int
    severity: str
    description: Optional[str] = None
    suggestion: Optional[str] = None
    module: Optional[str] = None
    type: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get(
    "/workspaces/{workspace_id}/stats",
    response_model=DefectStatsOut,
    summary="Thống kê defect theo DefectSeverity mới (BR-B3)",
    description=(
        "Đếm n_showstopper / n_logic / n_minor cho workspace — feed trực tiếp "
        "vào rule BR-B1 R-DELAY-3. Mapping từ severity legacy (critical/high/"
        "medium/low/info) của code_scanner."
    ),
)
async def get_stats(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DefectStatsOut:
    ws = await _load_workspace(db, workspace_id)
    if not _can_read(user, ws):
        raise HTTPException(status_code=403, detail="Không đủ quyền truy cập workspace")
    stats = await get_workspace_defect_stats(db, workspace_id)
    return DefectStatsOut(**stats.to_dict())


@router.patch(
    "/issues/{issue_id}/severity",
    response_model=SeverityOverrideOut,
    summary="Override severity 1 defect (mentor) — ghi audit",
    description=(
        "Đổi `severity` (cột legacy) sang 1 giá trị mới. Mọi thay đổi ghi "
        "vào `audit_code_analysis_issues` (cam kết §4.2). Chỉ admin/mentor."
    ),
)
async def override_severity(
    issue_id: int,
    req: SeverityOverrideIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("admin", "mentor")),
) -> SeverityOverrideOut:
    issue = (await db.execute(
        select(CodeAnalysisIssue).where(CodeAnalysisIssue.id == issue_id)
    )).scalar_one_or_none()
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue {issue_id} không tồn tại")

    new_sev = _validate_severity(req.severity)
    before_json = _snapshot(issue)
    issue.severity = new_sev
    # Ghép reason vào description nếu có (giúp hiển thị trên UI mà không cần cột mới)
    if req.reason:
        marker = f"\n[OVERRIDE by {user.username} @ {datetime.utcnow().isoformat()}]: {req.reason}"
        issue.description = (issue.description or "") + marker
    after_json = _snapshot(issue)

    db.add(AuditCodeAnalysisIssue(
        issue_id=issue.id,
        action="update",
        actor_id=user.id,
        before=before_json,
        after=after_json,
    ))
    await db.commit()
    await db.refresh(issue)
    return SeverityOverrideOut(
        id=issue.id,
        analysis_id=issue.analysis_id,
        file=issue.file,
        line=issue.line,
        severity=issue.severity,
        description=issue.description,
        suggestion=issue.suggestion,
        module=issue.module,
        type=issue.type,
    )
