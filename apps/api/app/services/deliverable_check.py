"""Stage 1 — Logic đối chiếu file sinh viên nộp đủ deliverables hay chưa.

Pure function, 0 LLM, 0 I/O. So khớp workspace files ↔ rubric.deliverables.
REFACTOR: bỏ keyword matching, chỉ giữ type_ok. Field mới: content_ok, ai_classified.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DeliverableMatch:
    code: str
    name: str
    file_types: list[str]
    desc: str
    present: bool
    matched_file: str | None = None
    # Layer 2 fields — AI classification
    content_ok: bool | None = None           # None = chưa check / AI lỗi, True=đạt, False=thiếu
    content_reason: str | None = None        # lý do AI gán / từ chối
    ai_classified: bool = False              # True nếu Layer 2 đã chạy


@dataclass
class DeliverableCheckResult:
    items: list[DeliverableMatch] = field(default_factory=list)
    total: int = 0
    present_count: int = 0

    @property
    def percent(self) -> int:
        if self.total == 0:
            return 0
        return round(100 * self.present_count / self.total)

    @property
    def missing(self) -> list[str]:
        return [it.code for it in self.items if not it.present]


def check_deliverables(
    files: list[dict[str, Any]], deliverables: list[dict[str, Any]]
) -> DeliverableCheckResult:
    """Đối chiếu files (workspace) với deliverables (rubric) — فقط theo LOẠI FILE.

    REFACTOR: chỉ dùng file_types (đuôi), bỏ so khớp tên file (keyword).
    Đây là Lớp 1 (Presence). Lớp 2 (AI classify) được gọi riêng để xác định
    content_ok + deliverable code.

    Args:
        files: list các dict có ít nhất ``filename`` và ``file_type``
            (vd [{"filename": "bao-cao.docx", "file_type": ".docx"}]).
        deliverables: list các dict từ rubric.config["deliverables"]
            (vd [{"code": "R3", "name": "...", "file_types": [".docx"], "desc": "..."}]).

    Returns:
        DeliverableCheckResult với từng deliverable present hay không + % hoàn thành.
    """
    norm_files = [
        {
            "filename": (f.get("filename") or ""),
            "file_type": (f.get("file_type") or "").lower(),
            "document_id": f.get("document_id"),
        }
        for f in files
    ]

    items: list[DeliverableMatch] = []
    for d in deliverables:
        code = d.get("code", "")
        name = d.get("name", "")
        file_types = [t.lower() for t in d.get("file_types", [])]
        desc = d.get("desc", "")

        matched = None
        for f in norm_files:
            type_ok = f["file_type"] in file_types if file_types else True
            if type_ok:
                matched = f["filename"]
                break

        items.append(
            DeliverableMatch(
                code=code,
                name=name,
                file_types=file_types,
                desc=desc,
                present=matched is not None,
                matched_file=matched,
            )
        )

    present_count = sum(1 for it in items if it.present)
    return DeliverableCheckResult(
        items=items, total=len(items), present_count=present_count
    )