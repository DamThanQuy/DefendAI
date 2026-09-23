"""Unit tests for classify_archive & decide_source_code (nâng cấp 2026-09).

Verify:
- Manifest check ở mọi nơi (không chỉ root)
- source-dir bonus (file nằm trong src/, app/...)
- project_type detection
- byte_ratio fallback
- reject khi không có file code
- pass khi có manifest + frontend files
"""
import pytest

from app.services.code_scanner import (
    AMBIGUOUS_RATIO,
    CLEAR_RATIO,
    classify_archive,
    decide_source_code,
)


def _members(*paths: str) -> list[str]:
    return list(paths)


# ──────────────── classify_archive ────────────────


def test_classify_empty_archive():
    c = classify_archive([])
    assert c["total"] == 0
    assert c["real_code_count"] == 0
    assert c["code_ratio"] == 0
    assert c["byte_ratio"] == 0
    assert c["project_type"] == "unknown"
    assert c["preview"] == []


def test_classify_real_code_dominant():
    members = _members(
        "src/index.ts",
        "src/app.tsx",
        "src/utils.ts",
        "README.md",
    )
    c = classify_archive(members)
    assert c["real_code_count"] == 3
    assert c["doc_count"] == 1
    assert c["project_type"] == "frontend"  # tsx
    assert c["has_source_dir"] is True
    assert c["preview"] == ["src/index.ts", "src/app.tsx", "src/utils.ts"]


def test_classify_backend_python():
    members = _members(
        "app/main.py",
        "app/routers/api.py",
        "requirements.txt",
        "README.md",
    )
    c = classify_archive(members)
    assert c["real_code_count"] == 2
    assert c["has_manifest"] is True
    assert c["manifest_paths"] == ["requirements.txt"]
    assert c["project_type"] == "backend"
    assert c["has_source_dir"] is True


def test_classify_fullstack_mixed():
    members = _members(
        "frontend/src/App.tsx",
        "backend/api/main.py",
        "frontend/package.json",
    )
    c = classify_archive(members)
    assert c["project_type"] == "fullstack"
    assert c["has_manifest"] is True
    assert c["real_code_count"] == 2


def test_classify_manifest_in_subdir():
    """Manifest ở folder con vẫn được tính (vd: apps/web/package.json)."""
    members = _members(
        "apps/web/package.json",
        "apps/web/src/index.tsx",
    )
    c = classify_archive(members)
    assert c["has_manifest"] is True
    assert "apps/web/package.json" in c["manifest_paths"]


def test_classify_no_real_code_only_docs():
    members = _members(
        "README.md",
        "docs/intro.md",
        "data.json",
    )
    c = classify_archive(members)
    assert c["real_code_count"] == 0
    assert c["doc_count"] == 2
    assert c["config_count"] == 1
    assert c["project_type"] == "unknown"


# ──────────────── decide_source_code ────────────────


def test_decide_reject_when_no_code():
    c = classify_archive(["README.md", "docs.md"])
    assert decide_source_code(c) == "reject"


def test_decide_pass_with_manifest():
    c = classify_archive(["README.md", "package.json", "src/index.tsx"])
    assert decide_source_code(c) == "pass"


def test_decide_pass_with_source_dir():
    """Không cần manifest — chỉ cần file trong src/ là pass."""
    c = classify_archive(["src/index.ts", "src/app.ts"])
    assert decide_source_code(c) == "pass"


def test_decide_pass_with_high_code_ratio():
    members = [f"file{i}.py" for i in range(10)] + ["readme.md"]
    c = classify_archive(members)
    assert c["code_ratio"] > CLEAR_RATIO
    assert decide_source_code(c) == "pass"


def test_decide_reject_with_very_low_ratio():
    # 5 doc files + 1 code = 16.7% ratio (above AMBIGUOUS but below CLEAR)
    # 9 doc files + 1 code = 10% (still above AMBIGUOUS 5%)
    # 19 doc files + 1 code = 5% (right at threshold)
    # 20 doc files + 1 code = 4.7% → reject
    members = [f"readme{i}.md" for i in range(20)] + ["app.py"]
    c = classify_archive(members)
    assert c["code_ratio"] < AMBIGUOUS_RATIO
    assert decide_source_code(c) == "reject"


def test_decide_ambiguous_in_middle_range():
    """5% < ratio < 20% và không có manifest/source-dir → ambiguous."""
    # 5 code + 50 doc = 9% (ambiguous)
    members = [f"file{i}.py" for i in range(5)] + [f"doc{i}.md" for i in range(50)]
    c = classify_archive(members)
    assert AMBIGUOUS_RATIO < c["code_ratio"] < CLEAR_RATIO
    assert c["has_manifest"] is False
    assert c["has_source_dir"] is False
    assert decide_source_code(c) == "ambiguous"


def test_decide_pass_manifest_in_subfolder():
    """Manifest ở folder con + code file → pass (không bị reject)."""
    c = classify_archive([
        "apps/web/package.json",
        "apps/web/src/index.tsx",
        "apps/web/README.md",
    ])
    assert c["has_manifest"] is True
    assert decide_source_code(c) == "pass"
