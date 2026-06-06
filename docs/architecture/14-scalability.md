# 14 — Scalability Plan

## Overview

Kế hoạch scale từ 100 → 1000 → 10000 users.

## 100 Users (MVP)

| Component | Config | Cost |
|-----------|--------|------|
| Frontend | 1 instance | $0 |
| Backend | 1 instance | $5 |
| Database | 1 PostgreSQL | $0 |
| Storage | Local disk | $0 |
| AI API | Pay-per-use | $20-50 |
| **Total** | | **$25-55** |

**Architecture:** Monolith Docker Compose

## 1000 Users

| Change | Reason |
|--------|--------|
| Thêm Redis cache | Giảm 50% AI calls |
| Thêm Queue (BullMQ) | AI async processing |
| Horizontal scale | 2-3 backend instances |
| **Total** | **$100-200/month** |

## 10000 Users

| Change | Reason |
|--------|--------|
| Tách AI Microservice | CPU/GPU intensive |
| Thêm pgvector | RAG cần vector search |
| CDN cho file storage | File access pattern |
| Read replicas PostgreSQL | Query load |

## Microservice Priority

1. **AI Service** (tách đầu) — CPU/GPU intensive
2. Storage Service — File I/O
3. Meeting Service — WebSocket
4. Report Service — PDF generation

## Related Documents

- `01-system-overview.md` — Tổng quan
- `15-future-roadmap.md` — Roadmap