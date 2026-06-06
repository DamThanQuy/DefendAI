# 05 — Backend Architecture

## Overview

Python FastAPI backend với Vertical Slice Modules + Shared Kernel.

## Structure

```
apps/api/
├── main.py              # Entry point, CORS, lifespan
├── container.py         # DI container
├── config.py            # Settings
├── modules/             # Vertical Slices
│   ├── assessment/api/routes.py
│   ├── meeting/api/routes.py
│   ├── evaluation/api/routes.py
│   ├── report/api/routes.py
│   └── storage/api/routes.py
└── shared/
    ├── ai/gateway.py    # AI Gateway
    ├── database/        # DB connection
    ├── event/bus.py     # Event Bus
    └── config/          # Settings
```

## DI Container

```python
# container.py
from shared.ai.gateway import AIGateway
from shared.ai.openai_provider import OpenAIProvider

class Container:
    def __init__(self):
        self.ai_gateway: AIGateway = OpenAIProvider(
            api_key=settings.OPENAI_API_KEY
        )
        self.event_bus = EventBus()
        self.db_session = create_async_session()
```

## Error Handling

Tất cả API endpoints đều có error handling:
- `HTTPException` cho lỗi business
- Global exception handler cho lỗi không mong muốn
- Validation error từ Pydantic tự động

## Async Processing

AI processing dùng polling pattern:
1. Client gọi API → nhận `job_id`
2. Backend xử lý AI với `BackgroundTasks`
3. Client poll `/api/jobs/{job_id}` mỗi 2s

## Key Modules

| Module | Endpoints | Description |
|--------|-----------|-------------|
| assessment | `/api/v1/assessment/generate-questions` | AI generate questions |
| code_analysis | `/api/v1/code/scan` | AI scan source code |
| meeting | `/api/v1/meeting/*` | Room CRUD + WebSocket |
| evaluation | `/api/v1/evaluation/*` | Score management |
| report | `/api/v1/report/*` | PDF generation |
| storage | `/api/v1/storage/*` | File upload/download |

## Related Documents

- `01-system-overview.md` — Tổng quan
- `03-module-design.md` — Module design
- `04-folder-structure.md` — Folder structure
- `07-ai-architecture.md` — AI Gateway
- `12-api-design.md` — API endpoints