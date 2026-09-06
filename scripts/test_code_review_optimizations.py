"""Smoke test cho 4 đề xuất tối ưu code review (NotebookLM).

Chạy:
    cd DefendAI/apps/api
    python ../scripts/test_code_review_optimizations.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Allow running as a script — point to apps/api so 'app' package resolves
_HERE = Path(__file__).resolve().parent
_API_ROOT = _HERE.parent / "apps" / "api"
sys.path.insert(0, str(_API_ROOT))

from app.services.code_scanner import (  # noqa: E402
    ScannedFile,
    _is_static_or_generated,
    _module_content_hash,
    _split_into_module_jobs,
)


def test_is_static_filters_lockfile_and_minified() -> None:
    """Đề xuất 4: file rác/static bị filter."""
    assert _is_static_or_generated("package-lock.json")
    assert _is_static_or_generated("yarn.lock")
    assert _is_static_or_generated("dist/bundle.min.js")
    assert _is_static_or_generated("src/dist/bundle.bundle.js")
    assert _is_static_or_generated("app/.next/static/chunks/main.chunk.js")
    assert _is_static_or_generated("dist/main.chunk.js")
    # File thật phải qua filter
    assert not _is_static_or_generated("src/app.py")
    assert not _is_static_or_generated("apps/web/src/index.tsx")
    assert not _is_static_or_generated("README.md")
    # .d.ts thì giữ (type declaration có ích cho review)
    assert not _is_static_or_generated("types/api.d.ts")
    print("✓ test_is_static_filters_lockfile_and_minified")


def test_small_module_merging() -> None:
    """Đề xuất 2: folder <5 file gộp vào __shared__."""
    files: list[ScannedFile] = []
    # 3 folder nhỏ: utils/, helpers/, types/ (mỗi cái 2 file → <5)
    for folder in ["utils", "helpers", "types"]:
        for i in range(2):
            files.append(ScannedFile(path=f"{folder}/f{i}.py", content="x"))
    # 1 folder lớn: big/ (60 file → 2 chunks: 40 + 20)
    for i in range(60):
        files.append(ScannedFile(path=f"big/f{i}.py", content="y"))

    jobs = _split_into_module_jobs(files)
    names = [name for name, _ in jobs]
    assert any(n.startswith("__shared__") for n in names), f"Expected __shared__ in {names}"
    assert sum(1 for n in names if n.startswith("big")) == 2, f"Expected 2 chunks of 'big', got {names}"
    # Tổng số file đi vào module phải bằng tổng đầu vào
    total = sum(len(fs) for _, fs in jobs)
    assert total == len(files), f"Lost files: {total} vs {len(files)}"
    print(f"✓ test_small_module_merging ({len(jobs)} jobs: {names})")


def test_module_hash_changes_on_content() -> None:
    """Đề xuất 1: hash đổi khi content đổi, không đổi khi cùng nội dung."""
    a = _module_content_hash([ScannedFile("a.py", "x=1")])
    b = _module_content_hash([ScannedFile("a.py", "x=2")])
    c = _module_content_hash([ScannedFile("a.py", "x=1")])
    assert a != b, "Hash should change when content changes"
    assert a == c, "Hash should be stable for same content"
    assert len(a) == 64, "SHA256 hex must be 64 chars"
    print("✓ test_module_hash_changes_on_content")


def test_module_hash_independent_of_order() -> None:
    """Đề xuất 1: hash deterministic dù enumerate khác thứ tự."""
    f1 = ScannedFile("a.py", "1")
    f2 = ScannedFile("b.py", "2")
    h1 = _module_content_hash([f1, f2])
    h2 = _module_content_hash([f2, f1])
    assert h1 == h2, "Hash must be order-independent"
    print("✓ test_module_hash_independent_of_order")


def test_split_empty() -> None:
    """Edge case: 0 file → 0 job."""
    assert _split_into_module_jobs([]) == []
    print("✓ test_split_empty")


if __name__ == "__main__":
    test_is_static_filters_lockfile_and_minified()
    test_small_module_merging()
    test_module_hash_changes_on_content()
    test_module_hash_independent_of_order()
    test_split_empty()
    print("\n✅ All smoke tests passed (4 đề xuất NotebookLM)")