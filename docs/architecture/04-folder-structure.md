# 04 — Folder Structure

## Overview

Cấu trúc thư mục dự án theo Vertical Slice Architecture.

## Root Structure

```
DefendAI/
├── apps/
│   ├── web/                    # Next.js Frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   ├── components/
│   │   │   │   ├── ui/         # shadcn/ui components
│   │   │   │   ├── features/   # Feature components
│   │   │   │   │   ├── assessment/
│   │   │   │   │   ├── code-review/
│   │   │   │   │   ├── meeting/
│   │   │   │   │   └── report/
│   │   │   │   └── layout/
│   │   │   ├── hooks/          # React hooks
│   │   │   ├── lib/            # API client, utils
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── types/          # TypeScript types
│   │   │   └── config/         # App config
│   │   ├── public/
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── api/                    # FastAPI Backend
│       ├── modules/            # Vertical Slices
│       │   ├── assessment/
│       │   │   ├── api/        # routes.py, schemas.py
│       │   │   ├── domain/     # entities.py, value_objects.py
│       │   │   ├── service/    # business logic
│       │   │   └── tests/
│       │   ├── code_analysis/
│       │   ├── meeting/
│       │   ├── evaluation/
│       │   ├── report/
│       │   └── storage/
│       ├── shared/             # Shared Kernel
│       │   ├── ai/             # AI Gateway
│       │   │   ├── gateway.py
│       │   │   ├── openai_provider.py
│       │   │   └── prompts/
│       │   ├── database/
│       │   │   ├── base.py
│       │   │   ├── session.py
│       │   │   └── repository.py
│       │   ├── event/
│       │   └── config/
│       ├── main.py
│       ├── container.py
│       └── config.py
│
├── docker-compose.yml
├── .gitignore
├── MVP_PLAN.md
├── README.md
└── docs/
    ├── README.md
    ├── ARCHITECTURE_INDEX.md
    ├── architecture/
    ├── decisions/
    └── diagrams/
```

## Naming Conventions

| Layer | File | Convention |
|-------|------|------------|
| Module routes | `routes.py` | `/{module}/api/routes.py` |
| Module schemas | `schemas.py` | `/{module}/api/schemas.py` |
| Module entities | `entities.py` | `/{module}/domain/entities.py` |
| Module service | `*_service.py` | `/{module}/service/*_service.py` |
| Module tests | `test_*.py` | `/{module}/tests/test_*.py` |
| Repository | `*_repository.py` | `/{module}/infrastructure/*_repository.py` |

## Related Documents

- `03-module-design.md` — Module responsibilities
- `05-backend.md` — Backend implementation
- `06-frontend.md` — Frontend implementation