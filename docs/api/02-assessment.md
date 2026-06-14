# 02 — Assessment API

> AI phân tích tài liệu và sinh câu hỏi phản biện theo persona.

## Overview

Module nhận document_id + persona → chạy AI pipeline async (parse → chunk → prompt → call AI) → trả về 10 câu hỏi. Dùng polling pattern để check job status.

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/assessment/generate-questions` | AI sinh 10 câu hỏi |
| GET | `/api/assessment/jobs/{job_id}` | Kiểm tra trạng thái job |

---

## POST `/api/assessment/generate-questions`

Gửi document_id + persona → tạo job → chạy AI pipeline async.

### Request

```json
{
  "document_id": 1,
  "persona": "theory"
}
```

| Field | Type | Required | Giá trị |
|-------|------|----------|---------|
| `document_id` | int | ✅ | ID document đã upload |
| `persona` | string | ✅ | `theory`, `enterprise`, `strict` |

### Response (202 Accepted)

```json
{
  "job_id": "abc123",
  "status": "pending",
  "document_id": 1,
  "persona": "theory"
}
```

### Flow

```
POST /api/assessment/generate-questions { document_id, persona }
        ↓
Tạo job_id, save job record (status: pending)
        ↓
[BackgroundTasks] chạy AI pipeline async:
    1. Load document from DB
    2. Parse document (PDF/DOCX/PPTX) → text
    3. Chunk text (~1000 tokens/chunk)
    4. Load persona prompt
    5. Build prompt (system + chunks + persona)
    6. Call AI via AIGateway
    7. Parse JSON response → 10 questions
    8. Save to assessments table
    9. Update job status → completed
        ↓
Frontend polls GET /api/assessment/jobs/{job_id} mỗi 2s
        ↓
Job completed → render 10 questions
```

### Error Cases

| Status | Message | Nguyên nhân |
|--------|---------|-------------|
| 404 | Document not found | `document_id` không tồn tại |
| 400 | Invalid persona | Persona không phải `theory`/`enterprise`/`strict` |
| 422 | Document too short | Tài liệu quá ngắn, AI không sinh được câu hỏi |

---

## GET `/api/assessment/jobs/{job_id}`

Kiểm tra trạng thái của AI processing job.

### Response (200 OK) — Pending

```json
{
  "job_id": "abc123",
  "status": "processing",
  "document_id": 1,
  "persona": "theory"
}
```

### Response (200 OK) — Completed

```json
{
  "job_id": "abc123",
  "status": "completed",
  "document_id": 1,
  "persona": "theory",
  "questions": [
    {
      "id": 1,
      "question": "Bạn có thể giải thích cách hệ thống xử lý...",
      "suggestion": "Nên đề cập đến...",
      "category": "security"
    },
    ...
  ]
}
```

---

## Edge Cases

| Trường hợp ngoại lệ | Mức ưu tiên | Trạng thái | Ghi chú |
|---------------------|-------------|------------|---------|
| Document không tồn tại | 🔴 Cao | ✅ Đã giải quyết | Validate document_id trước khi tạo job |
| Persona không hợp lệ | 🔴 Cao | ✅ Đã giải quyết | Validate enum persona |
| AI provider timeout | 🔴 Cao | ❌ Chưa giải quyết | Cần retry logic + fallback provider |
| AI trả về JSON invalid | 🟡 Trung bình | ❌ Chưa giải quyết | Cần parse validation + retry |
| Document quá ngắn (< 50 chars) | 🟡 Trung bình | ✅ Đã giải quyết | Kiểm tra text length trước khi generate |
| Concurrent jobs cho cùng document | 🟢 Thấp | ❌ Chưa giải quyết | Có thể skip hoặc queue |
| Job chưa exist | 🟡 Trung bình | ✅ Đã giải quyết | Return 404 |

---

## Related

- Architecture: [`07-ai-architecture.md`](../architecture/07-ai-architecture.md) — AI Gateway
- Architecture: [`08-rag.md`](../architecture/08-rag.md) — RAG pipeline
- Flow: [`FLOW.md`](../../FLOW.md) — Main Flow, Persona Flow
