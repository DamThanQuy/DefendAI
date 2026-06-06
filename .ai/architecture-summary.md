# Architecture Summary — 1 Page

## 6 Vertical Slice Modules

```
assessment      → Upload + Parse + AI Generate Questions
code_analysis   → Source Code Scanning
meeting         → Mock Defense Room (Jitsi + Timer + WebSocket)
evaluation      → Scoring + Rubric
report          → PDF + Radar Chart
storage         → File upload/download
```

## Each Module Structure

```
module_name/
├── api/           # routes.py, schemas.py
├── domain/        # entities.py, value_objects.py, events.py
├── service/       # business logic (e.g., question_service.py)
├── infrastructure/ # repository.py, parser.py, ai_pipeline.py
└── tests/
```

## Key Patterns

| Pattern | Use |
|---------|-----|
| Repository | DB access (không SQL trong service) |
| Service | Business logic |
| Provider | AI Gateway (OpenAI/Gemini) |
| Event Bus | Module decoupling |
| Polling | Async AI processing |
| Vertical Slice | Module organization |

## Data Flow

```
Upload → Storage → Assessment (questions JSONB) → Frontend
        ↓
        Code Analysis (issues JSONB) → Frontend
        ↓
        Mock Defense (WebSocket) → Evaluation (radar_data JSONB) → Report (PDF)
```

## Critical Rules

1. AI qua Gateway (không direct provider)
2. DB qua Repository (không SQL trong controller)
3. Vertical Slice (modules độc lập)
4. Polling pattern (không sync AI)
5. JSONB cho AI output

## Tech Stack Quick Ref

- Frontend: Next.js 14 + Tailwind + shadcn/ui + Tanstack Query + Zustand
- Backend: FastAPI + SQLAlchemy 2.0 + Pydantic v2
- DB: PostgreSQL 16 (JSONB + future pgvector)
- AI: OpenAI GPT-4o (default), Gemini 1.5 Pro
- Video: Jitsi Meet API (iframe)
- Chart: recharts
- PDF: React-PDF
- Deploy: Docker Compose → Railway

## Database (6 tables)

```
documents ─┬─ assessments
           ├─ code_analyses
           └─ meetings ─ meeting_members
                  └─ evaluations ─ reports
```

## API Endpoints (prefix `/api/v1`)

- `POST /assessment/generate-questions`
- `POST /code/scan`
- `POST /documents/upload`
- `POST /meeting/rooms`
- `POST /evaluation/scores`
- `POST /report/generate`

Full detail: `docs/architecture/`