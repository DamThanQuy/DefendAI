# ADR-006: Worker-side bounded archive extraction

**Status:** Accepted

## Context

BR/source consistency analysis must inspect uploaded project archives without
extracting untrusted paths into the project directory or sending the entire
archive to an AI provider. Archive validation and extraction can also be too
expensive for the HTTP process.

## Decision

- Validate ZIP central-directory metadata before writing extracted files.
- Reject traversal, absolute/drive-qualified paths and symlink entries.
- Enforce archive, entry, expanded-size, per-file and compression-ratio limits.
- Extract only source/config/data/document entries into a job-scoped worker
  temporary directory.
- Detect common framework markers from bounded manifest files and select
  framework-specific templates/configuration; use a generic fallback when the
  framework is unknown instead of rejecting the project.
- Never use `extractall()` and never execute extracted files.
- Remove the temporary directory in a `finally` block by default.
- Register extraction as a Redis worker job; Phase 2 will connect it to the
  persisted analysis-job model.

RAR is intentionally outside the Phase 1 extraction path; existing archive
browsing behavior remains unchanged.

## Consequences

The original ZIP remains in MinIO. Only selected metadata/evidence can be
persisted later. A dedicated Docker volume is mounted at
`/var/lib/defendai/analysis-tmp` for worker-local temporary data.