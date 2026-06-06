# 02 — Tech Stack

## Overview

Danh sách công nghệ được chọn cho MVP, kèm so sánh và lý do.

## Frontend

| Công nghệ | Lựa chọn | Lý do |
|-----------|----------|-------|
| **Framework** | Next.js 14 (App Router) | SSR, file-based routing, API Routes cho BFF, team biết React |
| **UI** | Tailwind CSS + shadcn/ui | Utility-first, nhanh cho MVP, không conflict CSS, copy-paste component |
| **State** | Tanstack Query + Zustand | Tanstack Query cho server state, Zustand cho client state (nhẹ hơn Redux 10x) |
| **Validation** | Zod + React Hook Form | Type-safe, performant form handling |

**So sánh Frontend Framework:**

| Tiêu chí | Next.js | React+Vite | Nuxt | SvelteKit |
|----------|---------|------------|------|-----------|
| SSR/SSG | ✅ Built-in | ❌ Thêm setup | ✅ | ✅ |
| Routing | ✅ File-based | ❌ React Router | ✅ | ✅ |
| API Routes | ✅ BFF | ❌ | ✅ | ✅ |
| Ecosystem | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Learning curve | Thấp | Thấp | TB | TB |
| Team match | ✅ | ✅ | ❌ | ❌ |

## Backend

| Công nghệ | Lựa chọn | Lý do |
|-----------|----------|-------|
| **Framework** | Python FastAPI | Async native, AI ecosystem Python, auto Swagger, performance cao |
| **ORM** | SQLAlchemy 2.0 + Alembic | Python ORM mạnh nhất, async support, migration built-in |

**So sánh Backend Framework:**

| Tiêu chí | FastAPI | NestJS | Fastify | Spring Boot |
|----------|---------|--------|---------|-------------|
| Async | ✅ Native | ✅ | ✅ | ❌ Thread-based |
| AI Ecosystem | ✅ Python | ❌ Node.js | ❌ | ❌ |
| Auto Docs | ✅ Swagger | ✅ | ❌ | ✅ |
| Learning curve | Thấp | TB | Thấp | Cao |
| MVP Speed | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

## Database

| Công nghệ | Lựa chọn | Lý do |
|-----------|----------|-------|
| **Database** | PostgreSQL | JSONB, pgvector (future), full-text search, 30+ năm maturity |
| **ORM** | SQLAlchemy 2.0 | Repository pattern, async support |
| **Migration** | Alembic | Built-in với SQLAlchemy |

**So sánh Database:**

| Tiêu chí | PostgreSQL | MySQL | MongoDB | SQLite |
|----------|-----------|-------|---------|--------|
| JSONB | ✅ | ❌ | ✅ native | ❌ |
| Full-text | ✅ | ✅ | ❌ | ❌ |
| pgvector | ✅ | ❌ | ❌ | ❌ |
| ACID | ✅ | ✅ | ⚠️ | ✅ |
| Maturity | 30+ năm | 25+ năm | 15+ năm | 20+ năm |

## Storage

| Công nghệ | MVP | Production |
|-----------|-----|------------|
| **Storage** | Local disk | MinIO (S3-compatible) |
| **Abstraction** | `StorageProvider` class | Chuyển sang S3/R2 sau 1 dòng config |

## Queue & Cache

| Công nghệ | MVP Decision | Lý do |
|-----------|-------------|-------|
| **Queue** | ❌ Không dùng (Polling pattern) | AI processing sync với timeout + loading state |
| **Cache** | ❌ Không Redis (In-memory LRU) | Python `@lru_cache` đủ cho MVP 100 users |
| **Phase 2** | BullMQ + Redis | Khi cần scale > 100 users |

**Queue Comparison:**

| Queue | Ngôn ngữ | MVP Setup |
|-------|----------|-----------|
| BullMQ | Node.js | ✅ Dễ |
| RabbitMQ | Generic | ❌ Cần setup |
| Kafka | Generic | ❌ Nặng |
| ARQ | Python | ✅ Dễ |
| Không Queue | — | ✅ Nhanh |

## Realtime

| Công nghệ | Use case | MVP |
|-----------|----------|-----|
| FastAPI WebSocket | Room state, timer, roles | ✅ |
| SSE (Server-Sent Events) | AI progress updates | ✅ |
| Jitsi Meet API | Video Call | ✅ (iframe embed) |

## Khác

| Layer | Công nghệ | Lý do |
|-------|-----------|-------|
| **PDF** | React-PDF | Render từ React, cả client và server |
| **Chart** | recharts | React-native, radar chart có sẵn, TypeScript |
| **Video Call** | Jitsi Meet API | Free, iframe embed 5 phút |
| **Deploy** | Docker Compose → Railway | Docker cho dev, Railway cho staging/prod |

## Related Documents

- `01-system-overview.md` — Tổng quan kiến trúc
- `05-backend.md` — Backend implementation
- `06-frontend.md` — Frontend implementation
- `13-deployment.md` — Deployment
- `decisions/ADR-001-postgresql.md`
- `decisions/ADR-002-ai-gateway.md`
- `decisions/ADR-004-jitsi.md`