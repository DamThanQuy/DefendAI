"""Stage 1 — Logic đối chiếu file sinh viên nộp đủ deliverables hay chưa.

Pure function, 0 LLM, 0 I/O. So khớp workspace files ↔ rubric.deliverables.
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
    """Đối chiếu files (workspace) với deliverables (rubric).

    Args:
        files: list các dict có ít nhất ``filename`` và ``file_type``
            (vd [{"filename": "R3_SRS.docx", "file_type": ".docx"}]).
        deliverables: list các dict từ rubric.config["deliverables"]
            (vd [{"code": "R3", "name": "...", "file_types": [".docx"], "desc": "..."}]).

    Returns:
        DeliverableCheckResult với từng deliverable present hay không + % hoàn thành.
    """
    norm_files = [
        {
            "filename": (f.get("filename") or ""),
            "file_type": (f.get("file_type") or "").lower(),
        }
        for f in files
    ]

    items: list[DeliverableMatch] = []
    for d in deliverables:
        code = d.get("code", "")
        name = d.get("name", "")
        file_types = [t.lower() for t in d.get("file_types", [])]
        desc = d.get("desc", "")
        code_lower = code.lower()
        # Keyword bắt buộc: lấy từ d["keywords"] nếu có.
        # Nếu không: R1..R7 (mẫu "r<n>") → dùng chính code làm keyword (sv hay đặt "R3_SRS.docx").
        # SP/SL → KHÔNG bắt keyword, chỉ cần đúng file_type (.zip/.pptx).
        keywords = [k.lower() for k in d.get("keywords", [])]
        if not keywords and code_lower.startswith("r") and code_lower[1:].isdigit():
            keywords = [code_lower]

        matched = None
        for f in norm_files:
            fname_lower = f["filename"].lower()
            type_ok = f["file_type"] in file_types if file_types else True
            keyword_ok = not keywords or any(kw in fname_lower for kw in keywords)
            if type_ok and keyword_ok:
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