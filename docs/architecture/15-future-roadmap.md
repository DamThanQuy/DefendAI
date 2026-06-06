# 15 — Future Roadmap

## Overview

Lộ trình phát triển sau MVP 3 tuần.

## Phase 2 (Tháng 2)

- **Redis + Queue** (BullMQ) cho AI async processing
- **Auth** JWT + RBAC + Workspace
- **LiveKit** thay thế Jitsi cho video call chất lượng cao
- **Rate Limiting** để kiểm soát cost AI API
- **Admin Dashboard** cho quản lý

## Phase 3 (Tháng 3+)

- **AI Microservice** tách riêng
- **RAG with pgvector** cho semantic search
- **Payment Module** (Stripe)
- **B2B Workspace** cho trường học
- **Speech-to-Text** tự động ghi biên bản

## Migration Path

```
MVP (Monolith) → Phase 2 (Monolith + Redis) → Phase 3 (AI Microservice)
```

## Related Documents

- `14-scalability.md` — Scale plan
- `03-module-design.md` — Module design