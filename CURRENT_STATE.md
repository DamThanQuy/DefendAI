# 📊 CURRENT_STATE.md — Sprint Status

> AI Agent đọc file này trước khi implement feature.

---

## Current Sprint: Week 1 (Day 1-7)

**Sprint Goal:** Foundation + AI Module (Upload + Parse + AI Generate Questions + AI Scan Code)

**Start Date:** 2026-06-06
**End Date:** 2026-06-12
**Status:** 🟡 In Progress (Day 1)

---

## Completed ✅

- [x] Project structure (monorepo) - 2026-06-06
- [x] MVP plan 3 tuần - 2026-06-06
- [x] Team setup (3 dev: Quý, Dev A, Dev C) - 2026-06-06
- [x] GitHub repo created - 2026-06-06
- [x] Dev A invited (annguyennhat11a221-creator) - 2026-06-06
- [x] Dev C invited (NTBAao) - 2026-06-06
- [x] Architecture documentation v2.0 - 2026-06-06
- [x] AI-First documentation (AGENT.md, SYSTEM_CONTEXT.md, etc.) - 2026-06-06

## In Progress 🔄

- [ ] Quý: Setup FastAPI + test AI API
- [ ] Dev A: Setup Next.js + UI Kit
- [ ] Dev C: Setup PostgreSQL + schema

## Blocked 🚫

_Không có_

## Todo (theo ngày)

### Day 1-2 (Foundation)
- [ ] Quý: Setup FastAPI project, create ai_client.py
- [ ] Quý: Test OpenAI/Gemini connection
- [ ] Dev A: Setup Next.js + Tailwind + shadcn/ui
- [ ] Dev A: Build UI Kit (Button, Card, Modal, Spinner)
- [ ] Dev A: Create UploadZone component
- [ ] Dev C: Setup PostgreSQL via Docker
- [ ] Dev C: Design schema (Users, Documents, Sessions)
- [ ] Dev C: Setup SQLAlchemy Base + Session

### Day 3-4 (Parser + Prompts)
- [ ] Quý: document_parser.py (PDF/DOCX/PPTX)
- [ ] Quý: code_parser.py (unzip, filter files)
- [ ] Quý: Prompt engineering 3 personas + code review
- [ ] Dev A: Document preview component
- [ ] Dev A: Connect upload API
- [ ] Dev C: API Auth (defer) / API upload
- [ ] Dev C: Support .zip upload for source code

### Day 5-6 (API Endpoints)
- [ ] Quý: API /generate-questions (with polling)
- [ ] Quý: API /scan-code (with polling)
- [ ] Dev A: Question list UI (tab by persona)
- [ ] Dev A: Code review result UI
- [ ] Dev C: WebSocket setup (for real-time features)
- [ ] Dev C: WebSocket event types

### Day 7 (Integration + Polish)
- [ ] All: Integration testing
- [ ] Quý: Prompt optimization, error handling
- [ ] Dev A: Fix UI bugs, responsive
- [ ] Dev C: Deploy to dev environment

---

## Week 2 (Sprint 2) — Day 8-14

**Sprint Goal:** Mock Defense Room + Video Call + Timer + Roles

- [ ] Jitsi Meet integration
- [ ] Meeting room CRUD API
- [ ] Timer 3 giai đoạn (WebSocket)
- [ ] Role management (Host selects roles)
- [ ] Document sync in room

## Week 3 (Sprint 3) — Day 15-21

**Sprint Goal:** Evaluation + PDF Report + Radar Chart

- [ ] Scoring form (Rubric)
- [ ] AI feedback summary ("Bệnh án đồ án")
- [ ] Radar Chart
- [ ] PDF export
- [ ] Final testing + deploy

---

## Known Issues ⚠️

- _Chưa có issue nào được báo cáo_

## Technical Debt 🔧

- _Chưa track (sẽ update sau khi có code)_

---

## Future (Phase 2+)

- Redis + BullMQ Queue
- JWT Auth + RBAC
- pgvector for RAG
- AI Microservice
- Payment module

---

*Update file này sau mỗi task hoàn thành hoặc khi có issue/blocker.*