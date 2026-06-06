# 🔧 TECH_CONTEXT.md — Tech Stack & Trade-offs

> Tại sao chọn từng công nghệ. Alternatives. Trade-offs.

---

## Frontend

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **Next.js 14** | ✅ | SSR, file-routing, API Routes, team biết React | React+Vite (thiếu SSR), Nuxt (chuyên Vue), SvelteKit (chuyên Svelte) | Hơi nặng hơn Vite nhưng có SSR |
| **Tailwind CSS** | ✅ | Utility-first, nhanh cho MVP, không conflict | MUI (quá nặng), AntD (không linh hoạt) | Cần nhớ utility classes |
| **shadcn/ui** | ✅ | Copy-paste components, không phụ thuộc nặng | HeadlessUI (quá basic), Radix (cần config nhiều) | Phải maintain copy |
| **Tanstack Query** | ✅ | Best server state management | SWR (ít features hơn), Redux (overkill) | Có learning curve |
| **Zustand** | ✅ | Nhẹ, đơn giản | Redux (boilerplate nhiều), Context API (perf issues) | Ecosystem nhỏ hơn Redux |
| **Zod** | ✅ | Type-safe, share với backend | Yup (cũ hơn), Joi (Node-only) | Cần viết schema trùng với Pydantic |
| **React Hook Form** | ✅ | Performant, ít re-render | Formik (cũ), uncontrolled inputs | Cần Controller cho integration |

## Backend

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **Python FastAPI** | ✅ | AI ecosystem, async, auto Swagger | NestJS (Node.js yếu AI), Spring Boot (nặng), Express (low-level) | Python GIL, single thread |
| **SQLAlchemy 2.0** | ✅ | Async, mature, repository pattern | Tortoise ORM (less mature), Peewee (basic) | Cần hiểu async syntax |
| **Alembic** | ✅ | Built-in với SQLAlchemy | Manual migrations (rủi ro) | Học thêm 1 tool |
| **Pydantic v2** | ✅ | Type-safe, FastAPI integration | Marshmallow (cũ), dataclasses (no validation) | V2 có breaking changes |
| **Structlog** | ✅ | JSON logging, structured | Print (no context), stdlib logging (verbose) | Config ban đầu |

## Database

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **PostgreSQL** | ✅ | JSONB, pgvector future, full-text search, ACID | MySQL (thiếu JSONB), MongoDB (no ACID), SQLite (không scale) | Setup Docker cần thiết |
| **JSONB** | ✅ | Flexible cho AI output, query được | Separate tables (rigid), TEXT column (no query) | Migration risk nếu thay đổi structure |
| **Pgvector (future)** | 🔜 | Vector search cho RAG | Qdrant (thêm service), Pinecone (paid) | Cần extension setup |
| **SQLAlchemy ORM** | ✅ | Repository pattern, async | Raw SQL (rủi ro), Tortoise (less mature) | ORM overhead |

## AI

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **OpenAI GPT-4o** | ✅ | Stable, multimodal, good Vietnamese | Gemini (similar), Claude (expensive), local LLM (low quality) | Pay-per-use |
| **AI Gateway** | ✅ | Abstract provider, dễ switch | Direct OpenAI (hardcode) | Thêm 1 layer |
| **Custom Prompts** | ✅ | Full control, version-able | LangChain (overkill), LlamaIndex (RAG-focused) | Phải tự maintain prompts |
| **In-memory cache** | ✅ (MVP) | Đơn giản, không cần Redis | Redis (overkill cho MVP) | Mất cache khi restart |
| **Polling pattern** | ✅ (MVP) | Không cần WebSocket/Queue | BullMQ + Redis (overkill cho MVP) | User phải đợi 2-5s |

## Vector Search (Future)

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **pgvector** | 🔜 | Built-in PostgreSQL, no extra service | Qdrant (extra service), Pinecone (paid), Weaviate (heavy) | Performance thấp hơn dedicated vector DB |

## Queue (Future Phase 2)

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **BullMQ** | 🔜 | Best Node.js queue, Redis-backed | RabbitMQ (heavy), Kafka (overkill) | Cần Redis |
| **ARQ** | 🔜 alt | Python-native | Celery (cũ), Dramatiq (less popular) | Cần Redis |

## Storage

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **Local disk (MVP)** | ✅ | Đơn giản, free | MinIO (cần Docker), AWS S3 (paid) | Không scale |
| **MinIO (Future)** | 🔜 | S3-compatible, self-host | AWS S3 (paid), R2 (limited) | Thêm 1 service |
| **StorageProvider abstraction** | ✅ | Dễ switch | Direct disk access (hardcode) | Thêm 1 layer |

## Realtime

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **WebSocket (FastAPI)** | ✅ | Native, bidirectional | Socket.IO (overkill), Pusher (3rd party) | Cần handle reconnect |
| **SSE (Server-Sent Events)** | ✅ | 1 chiều, đơn giản cho AI progress | WebSocket (overkill cho 1-way) | 1-way only |
| **Jitsi Meet API** | ✅ | Free, iframe embed 5 phút | LiveKit (expensive), Daily/Agora (paid) | Quality trung bình |

## PDF

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **React-PDF** | ✅ | Render từ React, server + client | Puppeteer (cần Chromium), jsPDF (low-level) | Complex layout khó |

## Chart

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **recharts** | ✅ | React-native, TypeScript, radar có sẵn | Chart.js (low-level), D3.js (overkill) | Bundle size vừa |

## Deployment

| Tech | Chosen? | Why | Alternative | Trade-off |
|------|---------|-----|-------------|-----------|
| **Docker Compose (dev)** | ✅ | Reproducible, dễ setup | Native install (env issues) | Cần Docker |
| **Railway (prod)** | ✅ | $5/tháng, free PostgreSQL, auto-deploy | Vercel (chỉ frontend), Render (đắt hơn), VPS (tự maintain) | Vendor lock-in nhẹ |
| **GitHub Actions (CI/CD)** | ✅ | Free, tích hợp GitHub | Jenkins (heavy), GitLab CI (ngoài GitHub) | Cần config |

---

*Tổng kết: Mỗi tech được chọn dựa trên MVP speed, performance, maintainability, không phải trend. Xem chi tiết trong `docs/architecture/02-tech-stack.md` và `docs/decisions/`.*