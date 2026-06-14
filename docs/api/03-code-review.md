# 03 — Code Review API

> AI quét và phân tích source code từ file ZIP upload.

## Overview

Module nhận document_id (ZIP file) → giải nén → lọc file code relevant → chunk → AI phân tích → trả về danh sách issues + suggestions.

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/code/scan` | AI quét mã nguồn |
| GET | `/api/code/jobs/{job_id}` | Kiểm tra trạng thái job |

---

## POST `/api/code/scan`

Gửi document_id (ZIP) → tạo job → chạy code analysis pipeline async.

### Request

```json
{
  "document_id": 5
}
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `document_id` | int | ✅ | ID document ZIP đã upload |

### Response (202 Accepted)

```json
{
  "job_id": "xyz789",
  "status": "pending",
  "document_id": 5
}
```

### Flow

```
POST /api/code/scan { document_id }
        ↓
Tạo job_id, save job record (status: pending)
        ↓
[BackgroundTasks] chạy code analysis pipeline async:
    1. Load document from DB
    2. Extract ZIP → file tree
    3. Filter relevant files (.py/.js/.ts/.java/...)
    4. Skip node_modules/, .git/, dist/, __pycache__/
    5. Read file content
    6. Chunk (max 5 files, 2000 lines)
    7. AI analyze each chunk
    8. Aggregate issues + calculate pass_rate
    9. Save to code_analyses table
    10. Update job status → completed
        ↓
Frontend polls GET /api/code/jobs/{job_id}
        ↓
Job completed → display issues + suggestions
```

### Response (200 OK) — Completed

```json
{
  "job_id": "xyz789",
  "status": "completed",
  "document_id": 5,
  "summary": "Phát hiện 12 vấn đề trong 8 file code",
  "pass_rate": 75.5,
  "issues": [
    {
      "file": "src/auth.py",
      "line": 42,
      "severity": "error",
      "description": "Hardcoded password trong source code",
      "suggestion": "Di chuyển secrets ra environment variables"
    },
    ...
  ]
}
```

---

## GET `/api/code/jobs/{job_id}`

Kiểm tra trạng thái của code scan job.

### Response (200 OK) — Completed

```json
{
  "job_id": "xyz789",
  "status": "completed",
  "document_id": 5,
  "summary": "Phát hiện 12 vấn đề trong 8 file code",
  "pass_rate": 75.5,
  "issues": [...]
}
```

---

## Edge Cases

| Trường hợp ngoại lệ | Mức ưu tiên | Trạng thái | Ghi chú |
|---------------------|-------------|------------|---------|
| Document không tồn tại | 🔴 Cao | ✅ Đã giải quyết | Validate document_id |
| Document type không phải ZIP | 🔴 Cao | ❌ Chưa giải quyết | Cần validate doc_type == ZIP |
| ZIP bị corrupt | 🔴 Cao | ❌ Chưa giải quyết | Cần try/except khi extract ZIP |
| ZIP bomb | 🔴 Cao | ❌ Chưa giải quyết | Giới hạn kích thước giải nén |
| ZIP chứa > 1000 files | 🟡 Trung bình | ❌ Chưa giải quyết | Giới hạn số file xử lý |
| ZIP chứa file thực thi (.exe/.bat) | 🟡 Trung bình | ❌ Chưa giải quyết | Whitelist extension khi parse |
| Không tìm thấy file code nào | 🟡 Trung bình | ❌ Chưa giải quyết | Return thông báo rõ ràng |
| AI provider timeout | 🔴 Cao | ❌ Chưa giải quyết | Retry logic + fallback |
| Code quá dài (> 2000 dòng) | 🟡 Trung bình | ⚠️ Một phần | Chunking text có sẵn, chưa áp dụng cho code |

---

## Related

- Code: [`apps/api/app/services/code_parser.py`](../../apps/api/app/services/code_parser.py)
- Architecture: [`09-code-analysis.md`](../architecture/09-code-analysis.md)
- Flow: [`FLOW.md`](../../FLOW.md) — Code Analysis Flow
