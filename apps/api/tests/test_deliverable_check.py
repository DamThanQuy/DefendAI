"""Unit test Stage 1 — check_deliverables (pure function, 0 LLM)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.deliverable_check import check_deliverables  # noqa: E402


DELIVERABLES = [
    {"code": "R1", "name": "Report 1", "file_types": [".docx"], "desc": ""},
    {"code": "R3", "name": "Report 3 SRS", "file_types": [".docx"], "desc": ""},
    {"code": "R7", "name": "Report 7", "file_types": [".docx"], "desc": ""},
    {"code": "SP", "name": "Source code", "file_types": [".zip"], "desc": ""},
    {"code": "SL", "name": "Slide", "file_types": [".pptx"], "desc": ""},
]


def test_all_present():
    files = [
        {"filename": "R1_Introduction.docx", "file_type": ".docx"},
        {"filename": "R3_SRS.docx", "file_type": ".docx"},
        {"filename": "R7_Test.docx", "file_type": ".docx"},
        {"filename": "source.zip", "file_type": ".zip"},
        {"filename": "slide.pptx", "file_type": ".pptx"},
    ]
    r = check_deliverables(files, DELIVERABLES)
    assert r.total == 5
    assert r.present_count == 5
    assert r.percent == 100
    assert r.missing == []


def test_missing_r4_and_sp():
    # Plan chỉ có R1,R3,R7,SP,SL; thiếu R3 + SP
    files = [
        {"filename": "R1_Introduction.docx", "file_type": ".docx"},
        {"filename": "R7_Test.docx", "file_type": ".docx"},
        {"filename": "slide.pptx", "file_type": ".pptx"},
    ]
    r = check_deliverables(files, DELIVERABLES)
    assert r.total == 5
    assert r.present_count == 3
    assert set(r.missing) == {"R3", "SP"}
    # matched_file đúng
    r3 = next(it for it in r.items if it.code == "R3")
    assert r3.present is False
    assert r3.matched_file is None


def test_keyword_match_anywhere_in_name():
    # "R3" nằm giữa tên file
    files = [{"filename": "final_R3_SRS_v2.docx", "file_type": ".docx"}]
    r = check_deliverables(files, DELIVERABLES)
    r3 = next(it for it in r.items if it.code == "R3")
    assert r3.present is True
    assert "final_R3_SRS_v2.docx" == r3.matched_file


def test_file_type_mismatch_not_matched():
    # Tên có R3 nhưng sai file_type (.pdf) → không khớp
    files = [{"filename": "R3_SRS.pdf", "file_type": ".pdf"}]
    r = check_deliverables(files, DELIVERABLES)
    r3 = next(it for it in r.items if it.code == "R3")
    assert r3.present is False


def test_empty_files_all_missing():
    r = check_deliverables([], DELIVERABLES)
    assert r.total == 5
    assert r.present_count == 0
    assert r.percent == 0
    assert r.missing == ["R1", "R3", "R7", "SP", "SL"]


if __name__ == "__main__":
    test_all_present()
    test_missing_r4_and_sp()
    test_keyword_match_anywhere_in_name()
    test_file_type_mismatch_not_matched()
    test_empty_files_all_missing()
    print("OK all deliverable_check tests passed")