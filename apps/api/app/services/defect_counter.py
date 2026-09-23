"""DefectCounter — đếm defect theo DefectSeverity mới, phục vụ rule BR-B1 R-DELAY-3.

Chiến lược đếm (an toàn + tương thích ngược):
  - Source: bảng `code_analysis_issues` với cột `severity` (legacy critical/high/medium/low/info)
  - Map sang DefectSeverity mới (show_stopper/logic/minor) qua `map_legacy_severity`
  - Lọc theo workspace: tìm `CodeAnalysis` thuộc document nằm trong workspace

Quy ước:
  - Không có analysis / không có issue → (0, 0)
  - Workspace_id is None hoặc 0 → (0, 0)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assessment import CodeAnalysis, CodeAnalysisIssue
from app.models.defect_severity import DefectSeverity, map_legacy_severity
from app.models.workspace import WorkspaceFile

logger = logging.getLogger(__name__)


@dataclass
class DefectStats:
    """Thống kê defect của 1 workspace, theo DefectSeverity mới."""

    workspace_id: int
    total: int
    n_showstopper: int
    n_logic: int
    n_minor: int
    # Phân bố theo severity legacy (giúp debug)
    legacy_breakdown: dict[str, int]

    def to_dict(self) -> dict:
        return {
            "workspace_id": self.workspace_id,
            "total": self.total,
            "n_showstopper": self.n_showstopper,
            "n_logic": self.n_logic,
            "n_minor": self.n_minor,
            "legacy_breakdown": self.legacy_breakdown,
        }


async def _list_workspace_analysis_ids(
    db: AsyncSession, workspace_id: int
) -> list[int]:
    """Lấy tất cả CodeAnalysis.id mà document thuộc workspace này."""
    stmt = (
        select(CodeAnalysis.id)
        .join(WorkspaceFile, WorkspaceFile.document_id == CodeAnalysis.document_id)
        .where(WorkspaceFile.workspace_id == workspace_id)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def get_workspace_defect_stats(
    db: AsyncSession, workspace_id: int
) -> DefectStats:
    """Đếm defect theo DefectSeverity mới cho 1 workspace.

    Returns:
        DefectStats với total=0 nếu workspace chưa có analysis nào.
    """
    analysis_ids = await _list_workspace_analysis_ids(db, workspace_id)
    if not analysis_ids:
        return DefectStats(
            workspace_id=workspace_id,
            total=0,
            n_showstopper=0,
            n_logic=0,
            n_minor=0,
            legacy_breakdown={},
        )

    rows = (await db.execute(
        select(CodeAnalysisIssue.severity).where(
            CodeAnalysisIssue.analysis_id.in_(analysis_ids)
        )
    )).scalars().all()

    n_showstopper = 0
    n_logic = 0
    n_minor = 0
    legacy_breakdown: dict[str, int] = {}
    for raw in rows:
        key = (raw or "").strip().lower()
        legacy_breakdown[key] = legacy_breakdown.get(key, 0) + 1
        mapped = map_legacy_severity(raw)
        if mapped is None:
            # Severity lạ (không nằm trong mapping) → bỏ qua khỏi count
            # nhưng vẫn tính trong total để audit
            continue
        if mapped == DefectSeverity.show_stopper:
            n_showstopper += 1
        elif mapped == DefectSeverity.logic:
            n_logic += 1
        else:
            n_minor += 1

    total = len(rows)
    return DefectStats(
        workspace_id=workspace_id,
        total=total,
        n_showstopper=n_showstopper,
        n_logic=n_logic,
        n_minor=n_minor,
        legacy_breakdown=legacy_breakdown,
    )


async def get_defect_counts_for_rules(
    db: AsyncSession, workspace_id: Optional[int]
) -> tuple[int, int]:
    """Helper dùng cho rules engine: trả (n_logic, n_showstopper).

    - workspace_id None/0 → (0, 0) (R-DELAY-3 → pending_data)
    - workspace không có analysis → (0, 0) (R-DELAY-3 → pass vì n_logic=0 ≤ 3
      và n_showstopper=0 ≤ 1)
    """
    if not workspace_id:
        return 0, 0
    stats = await get_workspace_defect_stats(db, workspace_id)
    return stats.n_logic, stats.n_showstopper
