# 🏛 Architecture Index — AI Agent Entry Point

> **Mục đích:** AI Agent đọc file này trước để biết đọc file nào cho task nào.  
> **Tổng số file:** 15 architecture + 5 ADR + 3 diagrams

---

## System Overview
`architecture/01-system-overview.md` — Tổng quan kiến trúc, diagram, flow

## Tech Stack
`architecture/02-tech-stack.md` — Công nghệ + so sánh + lý do chọn

## Module Design
`architecture/03-module-design.md` — 6 Vertical Slice Modules + responsibilities

## Folder Structure
`architecture/04-folder-structure.md` — Full folder tree + naming conventions

## Backend
`architecture/05-backend.md` — FastAPI structure, DI container, error handling

## Frontend
`architecture/06-frontend.md` — Next.js pages, components, state management

## AI Architecture
`architecture/07-ai-architecture.md` — AI Gateway, Provider pattern, Prompt system

## RAG Pipeline
`architecture/08-rag.md` — Chunking, embedding, retrieval, generation

## Code Analysis
`architecture/09-code-analysis.md` — Source code scanning pipeline

## Mock Defense
`architecture/10-mock-defense.md` — Meeting room, WebSocket, Timer, Jitsi

## Database
`architecture/11-database.md` — ERD, JSONB strategy, indexing

## API Design
`architecture/12-api-design.md` — Endpoints, request/response format

## Deployment
`architecture/13-deployment.md` — Docker Compose, Railway, CI/CD

## Scalability
`architecture/14-scalability.md` — 100 → 1000 → 10000 users

## Future Roadmap
`architecture/15-future-roadmap.md` — Phase 2, Phase 3 migration path

---

## Task → File Mapping

| Task | Files cần đọc |
|------|---------------|
| Thêm AI provider mới | `07-ai-architecture.md`, `08-rag.md`, `ADR-002-ai-gateway.md` |
| Sửa database schema | `11-database.md`, `ADR-001-postgresql.md` |
| Thêm API endpoint | `05-backend.md`, `12-api-design.md` |
| Sửa module assessment | `03-module-design.md`, `08-rag.md`, `05-backend.md` |
| Deploy lên production | `13-deployment.md`, `04-folder-structure.md` |
| Scale system | `14-scalability.md`, `03-module-design.md` |
| Thêm tính năng mới | `01-system-overview.md`, `03-module-design.md`, `15-future-roadmap.md` |

---

## Key Decisions

| Decision | File |
|----------|------|
| Why PostgreSQL? | `decisions/ADR-001-postgresql.md` |
| Why AI Gateway? | `decisions/ADR-002-ai-gateway.md` |
| Why Vertical Slices? | `decisions/ADR-003-vertical-slices.md` |
| Why Jitsi? | `decisions/ADR-004-jitsi.md` |
| Why no Auth in MVP? | `decisions/ADR-005-no-auth-mvp.md` |

---

## Diagrams

| Diagram | File |
|---------|------|
| System architecture | `diagrams/system.mmd` |
| Deployment flow | `diagrams/deployment.mmd` |
| Key sequences | `diagrams/sequence.mmd` |

---

*Full navigation: [`README.md`](README.md)*