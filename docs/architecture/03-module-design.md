# 03 — Module Design

## Overview

Hệ thống được thiết kế theo **Vertical Slice Architecture** — mỗi module là một domain độc lập hoàn toàn, có API riêng, domain logic riêng, database access riêng.

## Architecture

```
backend/modules/
├── assessment/       # Upload + Parse + AI Generate Questions
├── code_analysis/   # Source Code Scanning
├── meeting/         # Mock Defense Room
├── evaluation/      # Scoring + Rubric
├── report/          # PDF Generation + Radar
└── storage/         # File upload/download
```

## Module Responsibilities

| Module | Responsibility | Key Files | Owner |
|--------|---------------|-----------|-------|
| **assessment** | Upload file, parse document, AI generate questions | `document_service`, `parser_service`, `question_service` | Quý |
| **code_analysis** | Upload source code, parse AST, AI scan code | `code_service`, `ast_parser`, `code_review_service` | Quý + Dev C |
| **meeting** | Room CRUD, Jitsi integration, Timer, Roles, WebSocket | `room_service`, `timer_service`, `ws_handler` | Dev C + A |
| **evaluation** | Score CRUD, Rubric management, average calculation | `score_service`, `rubric_service` | Dev C |
| **report** | PDF generation, Radar chart data, AI feedback summary | `pdf_service`, `report_generator`, `ai_feedback` | Quý + Dev A |
| **storage** | File upload/download to disk/S3 | `file_service`, `storage_provider` | Dev C |

## Module Structure (mỗi module)

```
assessment/
├── api/
│   ├── routes.py        # API endpoints
│   └── schemas.py       # Pydantic request/response
├── domain/
│   ├── entities.py       # Business entities
│   ├── value_objects.py  # Value objects
│   └── events.py        # Domain events
├── service/
│   ├── *service.py      # Business logic
├── infrastructure/
│   ├── repository.py    # Database access
│   ├── parser.py        # External parser
│   └── ai_pipeline.py   # AI logic
└── tests/
```

## Module Independence

```
assessment → (storage) → code_analysis
     ↓                          ↓
  meeting → (evaluation) → report
```

Mỗi module:
- ✅ Có API riêng (routes.py + schemas.py)
- ✅ Có domain logic riêng (entities, service)
- ✅ Có database access riêng (repository)
- ✅ Không gọi trực tiếp module khác
- ✅ Giao tiếp qua event bus hoặc shared kernel
- ✅ Có thể test độc lập

## Shared Kernel

```python
shared/
├── ai/               # AI Gateway
│   ├── gateway.py    # Abstract base class
│   ├── openai_provider.py
│   ├── gemini_provider.py
│   └── prompts/
├── database/         # DB connection + repository base
├── event/            # Event bus
├── queue/            # Queue abstraction (future)
├── cache/            # Cache abstraction (future)
└── config/           # App config
```

## Advantages

- **Low coupling**: Module không gọi trực tiếp module khác
- **High cohesion**: Mỗi module chứa toàn bộ logic domain của nó
- **Dễ test**: Mock repository, test service độc lập
- **Dễ mở rộng**: Thêm module mới không ảnh hưởng module cũ
- **Dễ tách microservice**: Mỗi module có thể tách thành service riêng

## Related Documents

- `01-system-overview.md` — Tổng quan kiến trúc
- `04-folder-structure.md` — Folder tree chi tiết
- `05-backend.md` — Backend implementation
- `07-ai-architecture.md` — AI Gateway
- `decisions/ADR-003-vertical-slices.md`