# 01 — System Overview

## Overview

**DefendAI** là nền tảng AI Mock Graduation Defense. Hệ thống cho phép sinh viên upload đồ án, quét source code, AI phân tích → sinh câu hỏi phản biện → vào phòng bảo vệ giả định (video call + timer) → hội đồng chấm điểm → xuất PDF "Bệnh án đồ án".

## Purpose

Xây dựng MVP trong 3 tuần với 3 developers, tập trung vào main functions, không Auth, không Payment, không B2B.

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │         Next.js Frontend              │
                    │  (React + Tanstack Query + Zustand)   │
                    └──────┬──────────────┬────────────────┘
                           │ REST/SSE      │ WebSocket
                           ▼               ▼
┌──────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (Python)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────┐ │
│  │Assessment│ │ Meeting  │ │Evaluation│ │  Report  │ │Strg│ │
│  │ Module   │ │ Module   │ │ Module   │ │ Module   │ │    │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─┬──┘ │
│       └─────────────┴─────────────┴────────────┴─────────┘   │
│                    Shared Kernel                              │
│  AI Gateway │ Queue Client │ Repository │ Event Bus │ Config │
└──────────────────────────────┬────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  PostgreSQL   │    │    Redis      │    │   MinIO S3   │
   │  (Primary DB) │    │ (Queue+Cache) │    │  (File Store) │
   └──────────────┘    └──────────────┘    └──────────────┘
```

## Flow

```
Upload (.pdf/.zip) → Parse text/code → AI Phân tích → Render UI
                                                        ↓
                   Mock Defense → Chấm điểm → AI Review → PDF Report
```

## Components

| Component | Công nghệ | Port |
|-----------|-----------|------|
| Frontend | Next.js 14 | :3000 |
| Backend API | FastAPI | :8000 |
| Database | PostgreSQL | :5432 |
| Cache/Queue | Redis (Phase 2) | :6379 |
| File Storage | Local (MVP) → MinIO | :9000 |

## Advantages

- **Vertical Slice Modules**: Mỗi domain độc lập, dễ maintain
- **AI Gateway**: Abstraction layer, switch provider dễ dàng
- **Async Processing**: Polling pattern, không block HTTP
- **Event Bus**: Decouple modules, dễ mở rộng
- **Repository Pattern**: DB abstraction, dễ test

## Limitations

- **Không Queue trong MVP**: AI processing sync, timeout risk
- **Không Auth**: Chưa track được user
- **Không RAG thực sự**: Chunk + Prompt, chưa có vector DB
- **Jitsi quality**: Trung bình, không bằng LiveKit/Agora

## Future Improvements

- Thêm Redis + Queue (Phase 2)
- Thêm Auth JWT + RBAC (Phase 2)
- Thêm pgvector cho RAG (Phase 3)
- Tách AI Microservice (Phase 3)
- Thêm LiveKit cho video call (Phase 2)

## Related Documents

- `02-tech-stack.md` — Chi tiết tech stack
- `03-module-design.md` — Module responsibilities
- `05-backend.md` — Backend architecture
- `07-ai-architecture.md` — AI Gateway