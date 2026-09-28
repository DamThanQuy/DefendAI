"""Unit tests for Step 2 — analysis pipeline, manifest, source indexer,
storage helpers and idempotency hashing.

These tests intentionally avoid spinning up PostgreSQL/MinIO. They cover:

- ``source_indexer`` Python/JS/HTML extraction
- ``project_manifest`` mapping from ``ExtractionResult``
- ``analysis_storage`` temp-dir allocation + cleanup
- ``routers.analysis._hash_input`` + ``_compute_requirements_hash`` determinism
"""
from __future__ import annotations

import asyncio
import io
import os
import tempfile
import zipfile
from pathlib import Path

import pytest

from app.routers.analysis import _hash_input, _compute_requirements_hash
from app.services.analysis_storage import (
    cleanup_stale_storage,
    has_sufficient_disk_space,
    job_temp_dir,
)
from app.services.archive_extractor import extract_selected_zip
from app.services.archive_validator import ArchiveLimits
from app.services.project_manifest import build_project_manifest
from app.services.source_indexer import (
    EvidenceSnippet,
    index_source_file,
    index_source_files,
    snippet_to_embedding_text,
)


def _make_zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for path, content in entries.items():
            archive.writestr(path, content)
    return buf.getvalue()


# ─────────────────────────────────────────────── source_indexer ──


def test_index_python_extracts_function_class_and_decorator() -> None:
    text = (
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        "\n"
        "@router.post('/upload')\n"
        "async def upload_document(file):\n"
        "    return save(file)\n"
        "\n"
        "class DocumentService:\n"
        "    def parse(self, raw):\n"
        "        return raw\n"
    )
    snippets = index_source_file("apps/api/routers/documents.py", text)
    kinds = {(s.symbol_name, s.symbol_kind) for s in snippets}
    assert ("upload_document", "route") in kinds
    assert ("DocumentService", "class") in kinds
    routes = [s for s in snippets if s.symbol_kind == "route"]
    assert routes and routes[0].routes == ["POST /upload"]


def test_index_python_extracts_independent_function_calls() -> None:
    text = (
        "def process_order(cart):\n"
        "    validate(cart)\n"
        "    charge(cart)\n"
        "    notify(cart)\n"
    )
    snippets = index_source_file("services/orders.py", text)
    assert snippets and snippets[0].symbol_name == "process_order"
    assert {"validate", "charge", "notify"}.issubset(set(snippets[0].calls))


def test_index_javascript_extracts_routes_and_functions() -> None:
    text = (
        "import { Router } from 'express';\n"
        "const router = Router();\n"
        "\n"
        "router.post('/auth/login', loginHandler);\n"
        "router.get('/health', health);\n"
        "\n"
        "function loginHandler(req, res) {\n"
        "  res.json({ ok: true });\n"
        "}\n"
        "\n"
        "const logout = async (req, res) => {\n"
        "  res.json({ ok: true });\n"
        "};\n"
    )
    snippets = index_source_file("src/server.ts", text)
    routes = {s.routes[0] for s in snippets if s.routes}
    assert "POST /auth/login" in routes
    assert "GET /health" in routes
    assert any(s.symbol_kind == "arrow" and s.symbol_name == "logout" for s in snippets)


def test_index_html_template_extracts_routes() -> None:
    text = "{% url 'home' %}\n<p>Dashboard</p>\n{% url 'admin:index' %}\n"
    snippets = index_source_file("templates/dashboard.html", text)
    assert snippets
    assert {s.routes[0] for s in snippets} == {"GET home", "GET admin:index"}


def test_index_unknown_language_returns_empty() -> None:
    assert index_source_file("data.bin", "binary") == []


def test_snippet_to_embedding_text_is_serializable() -> None:
    snippet = EvidenceSnippet(
        path="apps/api/foo.py",
        language="python",
        symbol_name="bar",
        symbol_kind="function",
        line_start=1,
        line_end=5,
        snippet="def bar():\n    return 1\n",
        snippet_sha256="abc",
        calls=["baz"],
        keywords=["bar", "baz"],
    )
    text = snippet_to_embedding_text(snippet)
    import json

    parsed = json.loads(text)
    assert parsed["name"] == "bar"
    assert parsed["kind"] == "function"


# ─────────────────────────────────────────────── project_manifest ──


def test_project_manifest_skips_unsupported_paths(tmp_path: Path) -> None:
    archive = tmp_path / "project.zip"
    archive.write_bytes(_make_zip({
        "src/main.py": b"def main():\n    return 1\n",
        "src/util.js": b"function util(){return 1}\n",
        "node_modules/lib/index.js": b"ignored",
        "image.png": b"ignored",
        "README.md": b"# Project",
    }))
    result = asyncio.run(extract_selected_zip(
        archive,
        job_id="manifest-test",
        temp_dir=tmp_path,
        limits=ArchiveLimits(max_archive_bytes=10 * 1024 * 1024),
    ))
    manifest = build_project_manifest(result)
    assert manifest["framework"] == "generic"
    assert manifest["selection_mode"] == "generic_fallback"
    selected = {f["path"] for f in manifest["files"] if not f.get("skip_reason")}
    assert "src/main.py" in selected
    assert "src/util.js" in selected
    assert "node_modules/lib/index.js" not in selected
    assert "image.png" not in selected


def test_project_manifest_records_warnings(tmp_path: Path) -> None:
    archive = tmp_path / "project.zip"
    archive.write_bytes(_make_zip({
        "src/main.py": b"print('ok')",
        "nested.zip": b"binary",
    }))
    result = asyncio.run(extract_selected_zip(
        archive,
        job_id="warn-test",
        temp_dir=tmp_path,
        limits=ArchiveLimits(max_archive_bytes=10 * 1024 * 1024),
    ))
    manifest = build_project_manifest(result)
    assert manifest["warnings"]
    assert manifest["skipped_count"] >= 1


# ─────────────────────────────────────────────── analysis_storage ──


@pytest.mark.asyncio
async def test_job_temp_dir_creates_and_cleans_up(tmp_path: Path) -> None:
    job_id = "test-job-1"
    async with job_temp_dir(job_id, cleanup_on_finish=True) as alloc:
        assert alloc.root.exists()
        assert alloc.job_id == job_id
        (alloc.root / "data.txt").write_text("hello", encoding="utf-8")
    assert not alloc.root.exists()


def test_has_sufficient_disk_space_returns_bool(tmp_path: Path) -> None:
    assert isinstance(has_sufficient_disk_space(tmp_path), bool)


@pytest.mark.asyncio
async def test_cleanup_stale_storage_removes_old_dirs(tmp_path: Path) -> None:
    stale = tmp_path / "old-job"
    stale.mkdir()
    (stale / "source.py").write_text("x", encoding="utf-8")
    old = (os.stat(stale).st_mtime) - 10_000
    os.utime(stale, (old, old))
    removed = await cleanup_stale_storage(temp_dir=str(tmp_path), older_than_seconds=1)
    assert removed == 1
    assert not stale.exists()


# ─────────────────────────────────────────────── idempotency ──


def test_hash_input_is_deterministic() -> None:
    a = _hash_input("zip-hash", "req-hash", "step2-v1")
    b = _hash_input("zip-hash", "req-hash", "step2-v1")
    c = _hash_input("zip-hash", "req-hash", "step2-v2")
    assert a == b
    assert a != c


@pytest.mark.asyncio
async def test_compute_requirements_hash_is_order_independent() -> None:
    """The function normalises id ordering so reorders don't change the hash."""
    from unittest.mock import AsyncMock, MagicMock
    from app.models.entities import Document

    docs = [
        Document(id=1, filename="br.pdf", content_hash="hash-a"),
        Document(id=2, filename="srs.pdf", content_hash="hash-b"),
    ]
    # Build a coroutine that returns the list (matches await db.execute()).
    async def fake_execute(_stmt):
        result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = docs
        result.scalars.return_value = scalars
        return result
    db = MagicMock()
    db.execute = fake_execute
    hash_a, ids_a = await _compute_requirements_hash(db, [1, 2])
    hash_b, ids_b = await _compute_requirements_hash(db, [2, 1])
    assert hash_a == hash_b
    assert ids_a == ids_b == [1, 2]


# ─────────────────────────────────────────────── end-to-end stub ──


def test_index_source_files_combines_multiple_languages(tmp_path: Path) -> None:
    files = [
        ("api/main.py", "def handler(): return 1\n"),
        ("web/main.ts", "function handler() { return 1; }"),
        ("web/routes.html", "{% url 'home' %}\n"),
        ("data.bin", "binary"),
    ]
    snippets = index_source_files(files)
    languages = {s.language for s in snippets}
    assert "python" in languages
    assert "typescript" in languages
    assert "html" in languages
    assert "binary" not in languages