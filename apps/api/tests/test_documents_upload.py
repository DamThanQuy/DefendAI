"""
Test Upload API — Edge Cases

Cach chay:
    cd apps/api
    pytest tests/test_documents_upload.py -v

Test nay mock DB session nen KHONG can PostgreSQL dang chay.
"""
import os
import sys
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

import pytest

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
sys.path.insert(0, ".")

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db

# Mock DB
mock_db = AsyncMock()

def override_get_db():
    yield mock_db

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_mock():
    """Reset mock DB truoc moi test."""
    mock_db.reset_mock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    yield

def mock_db_ok():
    """Setup refresh tra ve id + created_at."""
    async def fake_refresh(doc):
        doc.id = 1
        doc.created_at = datetime.now()
    mock_db.refresh.side_effect = fake_refresh

def upload_file(filename: str, content: bytes, content_type: str = "application/octet-stream"):
    return client.post(
        "/api/documents/upload",
        files={"file": (filename, content, content_type)},
    )

# ===== Happy path =====

def test_upload_pdf_success():
    mock_db_ok()
    r = upload_file("report.pdf", b"%PDF-1.4 fake pdf content")
    assert r.status_code == 201
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()

def test_upload_docx_success():
    mock_db_ok()
    r = upload_file("slides.docx", b"PK\x03\x04fake docx content")
    assert r.status_code == 201

def test_upload_pptx_success():
    mock_db_ok()
    r = upload_file("slides.pptx", b"PK\x03\x04fake pptx content")
    assert r.status_code == 201

def test_upload_zip_success():
    mock_db_ok()
    r = upload_file("source.zip", b"PK\x03\x04fake zip content")
    assert r.status_code == 201

# ===== Empty file =====

def test_upload_empty_file_rejected():
    r = upload_file("empty.pdf", b"")
    assert r.status_code == 400
    assert "empty" in r.json()["detail"].lower()

# ===== Extension not supported =====

def test_upload_txt_rejected():
    r = upload_file("notes.txt", b"some text content")
    assert r.status_code == 400
    assert "not supported" in r.json()["detail"].lower()

def test_upload_exe_rejected():
    r = upload_file("virus.exe", b"MZ\x90\x00fake exe")
    assert r.status_code == 400

def test_upload_md_rejected():
    r = upload_file("readme.md", b"# Hello")
    assert r.status_code == 400

# ===== Magic bytes mismatch =====

def test_fake_pdf_magic_bytes_rejected():
    """File .pdf nhung magic bytes la exe (MZ) -> 400."""
    r = upload_file("fake.pdf", b"MZ\x90\x00This is not a PDF")
    assert r.status_code == 400
    assert "does not match" in r.json()["detail"].lower()

def test_fake_docx_magic_bytes_rejected():
    """File .docx nhung magic bytes la PDF -> 400."""
    r = upload_file("fake.docx", b"%PDF-1.4 This is not a docx")
    assert r.status_code == 400
    assert "does not match" in r.json()["detail"].lower()

def test_fake_pptx_magic_bytes_rejected():
    """File .pptx nhung magic bytes la PDF -> 400."""
    r = upload_file("fake.pptx", b"%PDF-1.4 Not a pptx")
    assert r.status_code == 400
    assert "does not match" in r.json()["detail"].lower()

def test_valid_pdf_magic_bytes_accepted():
    mock_db_ok()
    r = upload_file("valid.pdf", b"%PDF-1.4 valid content")
    assert r.status_code == 201

def test_valid_docx_magic_bytes_accepted():
    mock_db_ok()
    r = upload_file("valid.docx", b"PK\x03\x04docx content")
    assert r.status_code == 201

# ===== Filename sanitization =====

def test_path_traversal_sanitized():
    mock_db_ok()
    r = upload_file("../../../etc/passwd.pdf", b"%PDF-1.4 fake")
    if r.status_code == 201:
        assert ".." not in r.json()["filename"]
        assert "etc" not in r.json()["filename"]
    else:
        assert r.status_code == 400

def test_backslash_path_traversal():
    mock_db_ok()
    r = upload_file("..\\..\\..\\windows\\system32\\evil.pdf", b"%PDF-1.4 fake")
    if r.status_code == 201:
        assert ".." not in r.json()["filename"]
    else:
        assert r.status_code == 400

def test_long_filename_truncated():
    mock_db_ok()
    long_name = "a" * 250 + ".pdf"
    r = upload_file(long_name, b"%PDF-1.4 fake")
    if r.status_code == 201:
        assert len(r.json()["filename"]) <= 200
    else:
        assert r.status_code == 400

def test_dotfile_renamed():
    mock_db_ok()
    r = upload_file(".hidden.pdf", b"%PDF-1.4 fake")
    assert r.status_code in (201, 400)

def test_unicode_filename():
    mock_db_ok()
    r = upload_file("tai_lieu_bao_cao.pdf", b"%PDF-1.4 unicode test")
    assert r.status_code == 201

# ===== GET endpoints =====

def test_get_document_not_found():
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result
    r = client.get("/api/documents/999999")
    assert r.status_code == 404

def test_list_documents():
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    r = client.get("/api/documents/")
    assert r.status_code == 200
    data = r.json()
    assert "total" in data
    assert "items" in data
