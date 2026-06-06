# 11 — Database Design

## Overview

PostgreSQL database với JSONB strategy cho AI-generated content.

## Entity Relationship

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  documents   │──1:1──│  assessments      │       │  code_analyses   │
│              │       │                  │       │                  │
│ id (PK)      │       │ id (PK)          │       │ id (PK)          │
│ filename     │       │ document_id (FK) │       │ document_id (FK) │
│ file_path    │       │ persona           │       │ issues (JSONB)   │
│ file_type    │       │ chunks (JSONB)    │       │ summary (TEXT)   │
│ doc_type     │       │ questions (JSONB) │       │ pass_rate        │
│ content_hash │       │ status            │       └──────────────────┘
│ created_at   │       └──────────────────┘
└──────┬───────┘
       │ 1:N
       │
┌──────┴───────┐       ┌──────────────────┐       ┌──────────────────┐
│  meetings    │──1:N──│  meeting_members  │       │  evaluations     │
│              │       │                  │       │                  │
│ id (PK)      │       │ id (PK)          │──1:1──│ id (PK)          │
│ name         │       │ meeting_id (FK)  │       │ meeting_id (FK) │
│ status       │       │ name             │       │ reviewer_name    │
│ phase        │       │ role             │       │ scores (1-10)    │
│ timer_seconds│       │ joined_at        │       │ radar_data (JSONB)│
│ created_at   │       └──────────────────┘       │ created_at       │
└──────────────┘                                  └──────────────────┘
                                                          │ 1:1
                                                  ┌──────┴───────┐
                                                  │   reports     │
                                                  │               │
                                                  │ id (PK)      │
                                                  │ evaluation_id │
                                                  │ ai_feedback   │
                                                  │ weaknesses    │
                                                  │ pdf_path      │
                                                  │ pass_rate     │
                                                  │ created_at    │
                                                  └───────────────┘
```

## JSONB Strategy

| Table | JSONB Field | Content | Why? |
|-------|-------------|---------|------|
| `assessments` | `chunks` | Mảng chunk text | Flexible, không cần table riêng |
| `assessments` | `questions` | 10 câu hỏi + gợi ý | AI output format thay đổi |
| `code_analyses` | `issues` | Lỗi + severity | Số lượng không cố định |
| `evaluations` | `radar_data` | Điểm từng tiêu chí | Có thể thêm tiêu chí sau |
| `reports` | `weaknesses` | Điểm yếu | AI-generated, format flexible |

## Indexing

```sql
CREATE INDEX idx_documents_doc_type ON documents(doc_type);
CREATE INDEX idx_documents_content_hash ON documents(content_hash);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_meetings_status ON meetings(status);
```

## Future

- Thêm `workspace_id` cho multi-tenant (Phase 2)
- Thêm `user_id` cho auth (Phase 2)
- Thêm pgvector cho RAG (Phase 3)

## Related Documents

- `05-backend.md` — Backend
- `08-rag.md` — RAG pipeline
- `14-scalability.md` — Scalability
- `decisions/ADR-001-postgresql.md`