"""UseCaseMapper — tính tỉ lệ hoàn thành UC cho rules engine (BR-B1, BR-B2).

Công thức completion_ratio = completed / (committed + completed)
  - Bỏ qua status='omitted' (SV quyết định bỏ + có lý do → không tính)
  - Bỏ qua workspaces chưa có UC nào (return 0.0, không ngoại lệ)

Hàm cấp rule:
  - get_workspace_uc_stats(db, workspace_id) -> {total, committed, completed,
    omitted, completion_ratio}
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.use_case_commitment import UCStatus, UseCaseCommitment


@dataclass
class UCStats:
    """Kết quả thống kê UC của 1 workspace."""
    workspace_id: int
    total: int                # Tổng UC (committed + completed + omitted)
    committed: int            # committed (chưa chứng minh hoàn thành)
    completed: int            # completed (đã tick)
    omitted: int              # omitted (bỏ có lý do)
    completion_ratio: float   # completed / (committed + completed); 0.0 nếu cả 2 = 0

    def to_dict(self) -> dict:
        return {
            "workspace_id": self.workspace_id,
            "total": self.total,
            "committed": self.committed,
            "completed": self.completed,
            "omitted": self.omitted,
            "completion_ratio": self.completion_ratio,
        }


async def get_workspace_uc_stats(
    db: AsyncSession, workspace_id: int
) -> UCStats:
    """Thống kê UC của 1 workspace. Trả về zero-stat nếu workspace chưa có UC."""
    rows = (await db.execute(
        select(UseCaseCommitment).where(UseCaseCommitment.workspace_id == workspace_id)
    )).scalars().all()

    committed = sum(1 for r in rows if r.status == UCStatus.committed.value)
    completed = sum(1 for r in rows if r.status == UCStatus.completed.value)
    omitted = sum(1 for r in rows if r.status == UCStatus.omitted.value)
    total = committed + completed + omitted
    denom = committed + completed
    ratio = (completed / denom) if denom > 0 else 0.0
    return UCStats(
        workspace_id=workspace_id,
        total=total,
        committed=committed,
        completed=completed,
        omitted=omitted,
        completion_ratio=ratio,
    )


async def get_uc_count_for_rules(
    db: AsyncSession, workspace_id: Optional[int]
) -> tuple[int, float]:
    """Helper dùng cho rules engine: trả (total_uc, completion_ratio).

    Quy ước:
      - workspace_id is None hoặc 0 UC → (0, 0.0)
      - total_uc = committed + completed (bỏ omitted, theo Student Guide §4.2)
    """
    if not workspace_id:
        return 0, 0.0
    stats = await get_workspace_uc_stats(db, workspace_id)
    return stats.committed + stats.completed, stats.completion_ratio
