import zipfile

import pytest

from app.models.document import DocType, Document
from app.services.archive_service import list_archive_members, read_archive_member


@pytest.mark.asyncio
async def test_archive_service_reads_zip_members_without_loading_whole_file(monkeypatch, tmp_path):
    archive_path = tmp_path / "project.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("src/main.py", b"print('ok')\n")
        archive.writestr("README.md", b"hello")
        archive.writestr("node_modules/pkg.js", b"ignored")

    payload = archive_path.read_bytes()

    async def fake_iter_object_chunks(bucket: str, key: str, chunk_size: int = 8 * 1024 * 1024):
        for start in range(0, len(payload), chunk_size):
            yield payload[start : start + chunk_size]

    monkeypatch.setattr("app.services.archive_service.iter_object_chunks", fake_iter_object_chunks)

    doc = Document(
        id=1,
        filename="project.zip",
        file_type=".zip",
        doc_type=DocType.ZIP,
        storage_key="documents/project.zip",
    )

    members = await list_archive_members(doc)
    assert [member.path for member in members] == ["src/main.py", "README.md"]
    assert await read_archive_member(doc, "src/main.py") == b"print('ok')\n"
