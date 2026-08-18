"""Checkpoint 3 — Stage 3 deliverable-missing block injection (0 LLM, fake DB)."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.handlers.questions import _build_deliverable_missing_block  # noqa: E402

RUBRIC = {
    "deliverables": [
        {"code": "R1", "name": "Report 1", "file_types": [".docx"], "desc": ""},
        {"code": "R3", "name": "Report 3 SRS", "file_types": [".docx"], "desc": ""},
        {"code": "SP", "name": "Source code", "file_types": [".zip"], "desc": ""},
        {"code": "SL", "name": "Slide", "file_types": [".pptx"], "desc": ""},
    ]
}


class _Doc:
    def __init__(self, filename, file_type):
        self.filename = filename
        self.file_type = file_type


class _WF:
    def __init__(self, workspace_id, document=None):
        self.workspace_id = workspace_id
        self.document = document


class _Result:
    def __init__(self, wf, ws_files):
        self._wf = wf
        self._ws_files = ws_files

    def scalar_one_or_none(self):
        return self._wf

    def scalars(self):
        return self

    def all(self):
        return self._ws_files


class _FakeDB:
    def __init__(self, wf, ws_files):
        self._result = _Result(wf, ws_files)

    async def execute(self, *_args, **_kwargs):
        return self._result


def test_missing_block_lists_missing_files():
    db = _FakeDB(
        _WF(workspace_id=5),
        [
            _WF(5, _Doc("R1.docx", ".docx")),
            _WF(5, _Doc("source.zip", ".zip")),
            _WF(5, _Doc("slide.pptx", ".pptx")),
        ],
    )
    block = asyncio.run(_build_deliverable_missing_block(db, 32, RUBRIC))
    assert block
    assert "R3" in block
    assert "CHƯA NỘP ĐỦ" in block
    assert "mới nộp 3/4" in block


def test_no_missing_returns_empty():
    db = _FakeDB(
        _WF(workspace_id=5),
        [
            _WF(5, _Doc("R1.docx", ".docx")),
            _WF(5, _Doc("R3.docx", ".docx")),
            _WF(5, _Doc("source.zip", ".zip")),
            _WF(5, _Doc("slide.pptx", ".pptx")),
        ],
    )
    assert asyncio.run(_build_deliverable_missing_block(db, 32, RUBRIC)) == ""


def test_doc_without_workspace_returns_empty():
    db = _FakeDB(None, [])
    assert asyncio.run(_build_deliverable_missing_block(db, 99, RUBRIC)) == ""


if __name__ == "__main__":
    test_missing_block_lists_missing_files()
    test_no_missing_returns_empty()
    test_doc_without_workspace_returns_empty()
    print("OK Stage 3 inject tests passed")