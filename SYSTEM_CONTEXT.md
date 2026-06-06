# 🎯 SYSTEM_CONTEXT.md — 80% Project Knowledge

> AI Agent chỉ cần đọc file này là hiểu 80% project. Max 300 dòng.

---

## 1. Project

**DefendAI** — AI Mock Graduation Defense. MVP 3 tuần, 3 developers, no Auth, no Payment.

## 2. Architecture

**Monolith** FastAPI backend với 6 Vertical Slice Modules + Next.js frontend.

```
Next.js (3000) ↔ FastAPI (8000) ↔ PostgreSQL (5432)
                            ↳ Jitsi Meet API (iframe)
                            ↳ OpenAI/Gemini (via AI Gateway)
```

## 3. Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Frontend | Next.js 14 + Tailwind + shadcn/ui | SSR, nhanh cho MVP |
| Backend | Python FastAPI | AI ecosystem |
| Database | PostgreSQL | JSONB, pgvector future |
| ORM | SQLAlchemy 2.0 + Alembic | Async, repository pattern |
| AI | OpenAI GPT-4o / Gemini | GPT-4o default, switch via Gateway |
| Video | Jitsi Meet API | Free, iframe |
| Realtime | WebSocket + SSE | FastAPI native |
| PDF | React-PDF | Server + client |
| Chart | recharts | React-native, radar |
| Deploy | Docker Compose → Railway | Cheap MVP |

## 4. Folder

```
apps/
├── api/modules/        # 6 vertical slices (assessment, code_analysis, meeting, evaluation, report, storage)
│   ├── api/            # routes, schemas
│   ├── domain/         # entities, value objects
│   ├── service/        # business logic
│   └── infrastructure/ # repository, parsers, ai_pipeline
├── api/shared/         # AI Gateway, DB, Event Bus, Config
└── web/src/            # app, components, hooks, lib
```

## 5. Main Modules

| Module | Owner | Purpose |
|--------|-------|---------|
| assessment | Quý | Upload + Parse + AI Generate Questions |
| code_analysis | Quý + Dev C | Source Code Scanning |
| meeting | Dev C + A | Mock Defense Room (Jitsi + Timer) |
| evaluation | Dev C | Scoring + Rubric |
| report | Quý + A | PDF + Radar Chart |
| storage | Dev C | File upload/download |

## 6. Database (6 tables)

```
documents ──┬── assessments (questions JSONB)
            └── code_analyses (issues JSONB)
            └── meetings ── meeting_members
                    └── evaluations (radar_data JSONB) ── reports
```

All tables use `created_at` timestamp. JSONB stores AI-generated content.

## 7. AI Architecture

**AI Gateway** (abstraction layer) → Provider (OpenAI/Gemini) → LLM

```
Business Logic → AIGateway.generate() → OpenAIProvider | GeminiProvider
                       ↓
                 Structured JSON Output
```

**RAG MVP:** Chunk by paragraph → Build prompt → LLM → JSON
(No vector DB cho MVP, dùng full text)

## 8. Persona System

3 Personas (configurable):
- **theory_professor** — bắt lỗi lý thuyết
- **enterprise_reviewer** — bắt lỗi thực tế
- **strict_examiner** — hội đồng khắt khe

Prompts lưu ở `.ai/prompts/persona/`

## 9. Deployment

- **Dev:** Docker Compose (api, web, db)
- **Production:** Railway (auto-deploy from GitHub)
- **AI API:** Pay-per-use, ~$20-50/tháng cho 100 users

## 10. Conventions

| Aspect | Rule |
|--------|------|
| Code style | PEP 8, max 100 chars |
| Imports | Absolute, sorted |
| Types | Required (type hints) |
| Tests | 70%+ coverage service layer |
| Commits | `<type>(scope): subject` |
| Branches | `feature/`, `dev-b/`, etc. |

## 11. Rules (CRITICAL)

1. **Never** call AI Provider trực tiếp — dùng `AIGateway`
2. **Never** write SQL trong controller — dùng Repository
3. **Never** vi phạm Vertical Slice — modules độc lập
4. **Never** duplicate logic — dùng Shared Kernel
5. **Always** update docs khi thay đổi code
6. **Always** update `CURRENT_STATE.md` sau khi code

## 12. Roadmap

**MVP (3 tuần):** All main functions, no auth, no payment
**Phase 2 (Tháng 2):** Redis, Queue, Auth, LiveKit
**Phase 3 (Tháng 3+):** AI Microservice, pgvector, Payment, B2B

---

*Read next: `ARCHITECTURE_INDEX.md` để biết đọc file nào cho task nào.*