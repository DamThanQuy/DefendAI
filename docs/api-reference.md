# DefendAI — API Reference

> Base URL: `http://localhost:8000`
> Auth: Bearer token in `Authorization` header

---

## 📦 Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents` | List documents (paginated) |
| `POST` | `/api/documents/upload` | Upload file (multipart) |
| `GET` | `/api/documents/{id}` | Get document details |
| `GET` | `/api/documents/{id}/contents` | List files in ZIP archive |
| `GET` | `/api/documents/{id}/contents/{path}` | Get file content |
| `GET` | `/api/documents/{id}/download` | Download original file |

---

## 🔍 Code Review

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/code/scan` | Trigger code scan (async) → returns `analysis_id` |
| `GET` | `/api/code/analyses` | List my code analyses |
| `GET` | `/api/code/analyses/{id}` | Get analysis result + issues |
| `GET` | `/api/code/analyses/{id}/stats` | Severity stats summary |

### POST /api/code/scan Request

```json
{
  "document_id": 123,
  "provider": "nvidia",    // optional
  "model": "stepfun-ai/Step-3.7-Flash"  // optional
}
```

### POST /api/code/scan Response (202)

```json
{
  "analysis_id": 456,
  "job_id": "uuid...",
  "status": "queued"
}
```

### GET /api/code/analyses/{id} Response

```json
{
  "analysis_id": 456,
  "document_id": 123,
  "status": "completed",
  "summary": "Found 12 issues...",
  "total_files": 47,
  "total_modules": 3,
  "done_modules": 3,
  "stats": { "critical": 1, "high": 2, "medium": 5, "low": 4 },
  "issues": [
    {
      "id": 1,
      "module": "src",
      "file": "src/main.py",
      "line": 42,
      "type": "security",
      "severity": "high",
      "description": "Hardcoded password detected",
      "suggestion": "Use environment variables"
    }
  ]
}
```

---

## 🤖 Questions (AI Assessment)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/questions/generate` | Generate questions (async) → returns `job_id` |
| `GET` | `/api/questions/assessments/latest` | Get latest assessment |
| `GET` | `/api/questions/{id}` | Get assessment by ID |

### POST /api/questions/generate Request

```json
{
  "document_id": 123,
  "persona": "mentor"  // optional: mentor|investor|cto|ly_thuyet|thuc_te|khat_khe
}
```

### POST Response (202)

```json
{
  "job_id": "uuid...",
  "status": "queued",
  "message": "Generate questions job đã được xếp hàng."
}
```

### Assessment Response

```json
{
  "assessment_id": 789,
  "document_id": 123,
  "document_name": "do-an-kt1.docx",
  "status": "completed",
  "chunks_count": 15,
  "questions": [
    {
      "id": 1,
      "question": "Tại sao nhóm chọn React thay vì Vue?",
      "hint": "Nhóm đề cập về ecosystem và community support",
      "difficulty": "medium"
    }
  ],
  "provider": "default (multi-chunk)",
  "model": "default",
  "missing_submissions": [],
  "fallback_used": false
}
```

---

## ⚙️ Jobs (Async Polling)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs/{job_id}` | Get job status + progress |

### GET /api/jobs/{job_id} Response

```json
{
  "job_id": "uuid...",
  "type": "generate_questions",
  "status": "completed",
  "progress": "100",
  "result": { "assessment_id": 789, ... },
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:31:45Z"
}
```

Status values: `queued` → `processing` → `completed` | `failed`

---

## 🔐 Auth

All endpoints (except health) require authentication:

```
Authorization: Bearer <access_token>
```

Token obtained from:
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/google` (OAuth)

---

## 🛡️ Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Bad request — missing/invalid params |
| 401 | Unauthorized — invalid/missing token |
| 404 | Not found |
| 422 | Validation error / processing failed |
| 502 | Backend service unavailable |
| 504 | Gateway timeout (long-running job) |

---

## 🔄 Circuit Breaker (Internal)

When AI provider fails ≥5 times consecutively:
- **State → OPEN**: All requests immediately return fallback results
- **After 60s timeout → HALF_OPEN**: One probe call allowed
- **Probe success → CLOSED**: Normal operation resumes
- **Probe failure → OPEN**: Reset timeout

Visible in responses as `"provider": "circuit-breaker-fallback"` or `"fallback_used": true`.
