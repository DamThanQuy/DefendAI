# 🤖 AGENT.md — AI Coding Agent Rules

> File chính thức hướng dẫn AI Agent (Claude Code, Codex, Gemini CLI, Cline, OpenCode) làm việc với DefendAI.

---

## 1. Project Summary

**DefendAI** là nền tảng AI Mock Graduation Defense. Sinh viên upload đồ án/source code → AI phân tích → sinh câu hỏi phản biện → vào phòng bảo vệ giả định → chấm điểm → xuất PDF "Bệnh án đồ án".

## 2. Architecture (overview)

```
Frontend (Next.js) → Backend (FastAPI) → AI Gateway → OpenAI/Gemini
                              ↓
                          PostgreSQL
```

**6 Vertical Slice Modules:** `assessment`, `code_analysis`, `meeting`, `evaluation`, `report`, `storage`

## 3. Coding Convention

| Aspect | Rule |
|--------|------|
| **Language** | Python 3.11+ for backend, TypeScript for frontend |
| **Style** | PEP 8 (Python), ESLint default (TS) |
| **Line length** | Max 100 chars |
| **Imports** | Absolute, sorted by isort |
| **Type hints** | Required for all public functions |
| **Docstring** | Google style for Python, JSDoc for TS |

## 4. Folder Convention

```
apps/
├── api/                    # FastAPI backend
│   ├── modules/            # 6 vertical slices
│   │   ├── assessment/
│   │   │   ├── api/        # routes, schemas
│   │   │   ├── domain/     # entities, value objects, events
│   │   │   ├── service/    # business logic
│   │   │   └── infrastructure/  # repository, parser, ai_pipeline
│   │   └── ...
│   ├── shared/             # AI gateway, DB, event bus, config
│   └── main.py
└── web/                    # Next.js frontend
    ├── src/app/            # pages
    ├── src/components/     # UI
    └── src/hooks/          # React hooks
```

## 5. Naming Convention

| Layer | Convention | Example |
|-------|-----------|---------|
| Module routes | `routes.py` | `modules/assessment/api/routes.py` |
| Module schemas | `schemas.py` | `modules/assessment/api/schemas.py` |
| Module entities | `entities.py` | `modules/assessment/domain/entities.py` |
| Service | `*_service.py` | `question_service.py` |
| Repository | `*_repository.py` | `assessment_repository.py` |
| Pydantic models | PascalCase | `QuestionCreate`, `DocumentResponse` |
| Tables | snake_case + plural | `assessments`, `code_analyses` |
| React components | PascalCase | `QuestionList`, `UploadZone` |
| Hooks | use* prefix | `useAssessment`, `useWebSocket` |

## 6. Design Pattern

- **Repository Pattern** — DB access qua repository, không viết SQL trong service
- **Provider Pattern** — AI providers via abstract gateway
- **Service Pattern** — Business logic trong service layer
- **Event Bus** — Decouple modules via events
- **Vertical Slice** — Mỗi module là 1 domain độc lập
- **Polling Pattern** — Async AI processing

## 7. Module Rule

- Module phải self-contained
- Module giao tiếp qua event bus hoặc shared kernel
- Không gọi trực tiếp module khác
- Mỗi module có API, domain, service, infrastructure riêng

## 8. AI Rule

- **Always** gọi AI qua `AIGateway` (không gọi OpenAI trực tiếp)
- **Always** dùng prompt từ `.ai/prompts/` (không hardcode)
- **Always** dùng structured output (JSON) khi cần parse
- **Never** hardcode provider name
- **Never** xử lý AI sync trong HTTP request — dùng `BackgroundTasks`

## 9. Repository Rule

- **Always** truy cập DB qua repository
- **Never** viết SQL trong controller
- **Never** viết SQL trong service (trừ complex queries)
- Repository trả về entities (domain models), không trả raw dict
- Mỗi entity có 1 repository

## 10. DTO Rule

- Dùng Pydantic models cho request/response
- DTO không chứa business logic
- DTO ở `api/schemas.py`, không mix với entities
- Validate input ở Pydantic level (không check thủ công trong service)

## 11. Error Handling

- Dùng `HTTPException` cho HTTP errors
- Custom exception classes cho business errors (kế thừa từ base)
- Global exception handler trong `main.py`
- Log error với context (request_id, user_id nếu có)
- Trả error format: `{ "data": null, "error": { "code": "...", "message": "..." } }`

## 12. Logging Rule

- Dùng `structlog` hoặc `loguru`
- Log level: INFO cho business events, ERROR cho exceptions
- Include context: `request_id`, `document_id`, `user_id`
- **Never** log sensitive data (API keys, passwords)

## 13. Testing Rule

- Unit tests cho service layer
- Integration tests cho API endpoints
- Mỗi module có folder `tests/`
- Test naming: `test_*.py`
- Mock external services (OpenAI, Jitsi)
- Coverage target: 70%+ cho service layer

## 14. Commit Rule

```
<type>(<scope>): <subject>

<body>

<footer>
```

| Type | Usage |
|------|-------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code refactor (no behavior change) |
| `test` | Add tests |
| `chore` | Build, CI, deps |

**Example:** `feat(assessment): add AI question generation endpoint`

## 15. Refactor Rule

- **Before refactor:** Có tests passing
- **After refactor:** Có tests passing
- Refactor scope = 1 module per PR
- Update docs nếu có architectural change
- Tạo ADR nếu decision thay đổi

## 16. Future Rule

- Đọc `15-future-roadmap.md` để biết Phase 2/3 plan
- Không implement Phase 2 features trong MVP
- Nếu cần feature Phase 2, propose ADR mới trước

## 17. Read Order (cho AI Agent)

```
1. README_FOR_AI.md          ← Entry point
2. AGENT.md                 ← Rules (file này)
3. SYSTEM_CONTEXT.md        ← 80% project knowledge
4. ARCHITECTURE_INDEX.md    ← Map architecture files
5. CURRENT_STATE.md         ← Sprint status
6. DECISION_SUMMARY.md      ← ADR summary
7. docs/FUNCTIONS.md        ← 19 functions MVP
8. docs/architecture/XX.md  ← Task-specific file
```

## 18. Task Execution Rule

Khi nhận task:
1. Đọc README_FOR_AI.md → đọc file liên quan
2. Implement theo Vertical Slice pattern
3. Viết tests
4. Update CURRENT_STATE.md
5. Update docs nếu cần
6. Commit theo convention

## 19. File Modification Rule

- **Never** modify file trong `docs/architecture/` mà không update SUMMARY
- **Never** modify ADR mà không tạo ADR mới
- **Always** giữ backward compatibility khi modify public API
- **Always** add migration nếu thay đổi DB schema

## 20. Context Rule

- Tối đa 3-4 file docs cho 1 task
- Nếu phải đọc > 5 file → task quá lớn, cần break down
- Always link related files ở cuối mỗi file
- Always cite ADR khi make architectural decision

## 21. Prompt Rule

- Tất cả AI prompts lưu ở `.ai/prompts/`
- Naming: `<purpose>.md` (e.g., `assessment.md`, `code-analysis.md`)
- Include: role, context, instruction, output format
- Version control prompts như code

## 22. Output Rule

Khi output code/file changes, format:

```
### Files Changed
- `path/to/file1.py` (new)
- `path/to/file2.py` (modified)

### Tests
- [x] Unit tests pass
- [x] Integration tests pass

### Docs
- [x] Updated `architecture/XX.md`

### Notes
- Any decision, ADR reference, or important context
```

## 23. Agent Behavior

- **Be concise** — Code > prose
- **Be specific** — Use exact file paths, function names
- **Be consistent** — Follow patterns in existing code
- **Be cautious** — Don't break Vertical Slice boundary
- **Be helpful** — Update CURRENT_STATE.md for next agent

---

*Last updated: 2026-06-06*