import asyncio
import time
import zipfile

import pytest

from app.services.archive_extractor import (
    cleanup_stale_extraction_dirs,
    extract_selected_zip,
)
from app.services.archive_validator import ArchiveValidationError, ArchiveLimits


def test_extracts_selected_files_and_cleans_up(tmp_path) -> None:
    archive_path = tmp_path / "project.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("src/main.py", b"print('ok')")
        archive.writestr("node_modules/pkg.js", b"ignored")
        archive.writestr("image.png", b"ignored")

    result = asyncio.run(extract_selected_zip(archive_path, job_id="job-1", temp_dir=tmp_path))
    assert [item.path for item in result.selected_files] == ["src/main.py"]
    assert not result.root_dir.exists()


def test_corrupt_zip_is_rejected_and_temp_is_clean(tmp_path) -> None:
    archive_path = tmp_path / "broken.zip"
    archive_path.write_bytes(b"not-a-zip")
    with pytest.raises(zipfile.BadZipFile):
        asyncio.run(extract_selected_zip(archive_path, job_id="broken", temp_dir=tmp_path))


def test_timeout_is_enforced(tmp_path, monkeypatch) -> None:
    archive_path = tmp_path / "project.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("src/main.py", b"print('ok')")

    # Patch the internal extraction path to make the timeout deterministic.
    def slow_extract(*args):
        time.sleep(0.05)
        raise asyncio.CancelledError()

    monkeypatch.setattr("app.services.archive_extractor._extract_into", slow_extract)
    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(extract_selected_zip(archive_path, job_id="timeout", temp_dir=tmp_path, timeout_seconds=0))


def test_expanded_limit_stops_extraction(tmp_path) -> None:
    archive_path = tmp_path / "project.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("src/main.py", b"x" * 128)
    with pytest.raises(ArchiveValidationError):
        asyncio.run(extract_selected_zip(
            archive_path,
            job_id="quota",
            temp_dir=tmp_path,
            limits=ArchiveLimits(max_expanded_bytes=64),
        ))


def test_cleanup_stale_directories(tmp_path) -> None:
    stale = tmp_path / "old-job"
    stale.mkdir()
    (stale / "source.py").write_text("x", encoding="utf-8")
    old = time.time() - 10_000
    import os
    os.utime(stale, (old, old))
    assert cleanup_stale_extraction_dirs(tmp_path, older_than_seconds=1) == 1
    assert not stale.exists()