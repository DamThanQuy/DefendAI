import io
import stat
import zipfile

import pytest

from app.services.archive_validator import (
    ArchiveLimits,
    ArchiveValidationError,
    validate_zip_metadata,
)


def _zip(entries: dict[str, bytes]) -> zipfile.ZipFile:
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in entries.items():
            archive.writestr(path, content)
    return zipfile.ZipFile(io.BytesIO(raw.getvalue()))


def test_rejects_path_traversal() -> None:
    archive = _zip({"../secret.txt": b"no"})
    with pytest.raises(ArchiveValidationError):
        validate_zip_metadata(archive, archive_bytes=128)


@pytest.mark.parametrize("path", ["/etc/passwd", "C:/Windows/System32/x", "C:\\Windows\\x"])
def test_rejects_absolute_or_drive_paths(path: str) -> None:
    archive = _zip({path: b"no"})
    with pytest.raises(ArchiveValidationError):
        validate_zip_metadata(archive, archive_bytes=128)


def test_selects_source_and_skips_dependencies_binary_and_nested() -> None:
    archive = _zip({
        "src/main.py": b"print('ok')",
        "node_modules/pkg/index.js": b"ignored",
        "image.png": b"ignored",
        "nested.zip": b"ignored",
        "README.md": b"docs",
    })
    result = validate_zip_metadata(archive, archive_bytes=512)
    assert {entry.path for entry in result.selected_entries} == {"src/main.py", "README.md"}
    assert any(entry.skip_reason == "ignored_directory" for entry in result.entries)
    assert any(entry.skip_reason == "nested_archive" for entry in result.entries)
    assert result.warnings


def test_rejects_entry_limit() -> None:
    archive = _zip({f"src/{i}.py": b"x" for i in range(3)})
    with pytest.raises(ArchiveValidationError):
        validate_zip_metadata(archive, archive_bytes=256, limits=ArchiveLimits(max_entries=2))


def test_rejects_single_file_limit() -> None:
    archive = _zip({"src/large.py": b"x" * 32})
    with pytest.raises(ArchiveValidationError):
        validate_zip_metadata(archive, archive_bytes=256, limits=ArchiveLimits(max_entry_bytes=8))


def test_rejects_symlink_entry() -> None:
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w") as archive:
        info = zipfile.ZipInfo("src/link.py")
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, b"../../secret.py")
    with zipfile.ZipFile(io.BytesIO(raw.getvalue())) as archive:
        with pytest.raises(ArchiveValidationError, match="Symlink"):
            validate_zip_metadata(archive, archive_bytes=256)


def test_rejects_compression_ratio_bomb() -> None:
    archive = _zip({"src/large.py": b"x" * 100_000})
    with pytest.raises(ArchiveValidationError, match="Compression ratio"):
        validate_zip_metadata(archive, archive_bytes=1_000, limits=ArchiveLimits(max_compression_ratio=2))


def test_nested_archive_policy_rejects_when_configured() -> None:
    archive = _zip({"bundles/inner.zip": b"not extracted"})
    with pytest.raises(ArchiveValidationError, match="Nested"):
        validate_zip_metadata(
            archive,
            archive_bytes=256,
            limits=ArchiveLimits(reject_nested_archives=True),
        )


def test_nested_archive_depth_is_reported() -> None:
    archive = _zip({"outer.zip/inner.zip": b"not extracted"})
    with pytest.raises(ArchiveValidationError, match="Nested archive depth"):
        validate_zip_metadata(
            archive,
            archive_bytes=256,
            limits=ArchiveLimits(max_nested_archive_depth=1),
        )


def test_detects_next_and_selects_framework_config() -> None:
    archive = _zip({
        "package.json": b'{"dependencies":{"next":"14.0.0"}}',
        "next.config.mjs": b"export default {}",
        "app/page.tsx": b"export default function Page() {}",
        "app/page.module.scss": b".page {}",
    })
    result = validate_zip_metadata(archive, archive_bytes=512)
    assert result.framework.name == "nextjs"
    assert result.selection_mode == "framework_aware"
    assert {entry.path for entry in result.selected_entries} == {
        "package.json", "next.config.mjs", "app/page.tsx", "app/page.module.scss",
    }


def test_unknown_framework_uses_generic_fallback() -> None:
    archive = _zip({"src/main.rs": b"fn main() {}", "assets/image.png": b"image"})
    result = validate_zip_metadata(archive, archive_bytes=256)
    assert result.framework.name == "generic"
    assert result.selection_mode == "generic_fallback"
    assert "src/main.rs" in {entry.path for entry in result.selected_entries}