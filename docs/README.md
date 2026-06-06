# 📚 DefendAI — Documentation

> **Phiên bản:** 2.0  
> **Mục đích:** Hệ thống tài liệu kiến trúc cho dự án DefendAI MVP 3 tuần  
> **Đối tượng:** Developer, AI Agent, Technical Reviewer

---

## Tổng quan dự án

**DefendAI** là nền tảng AI Mock Graduation Defense. Sinh viên upload đồ án / source code → AI phân tích → sinh câu hỏi phản biện → vào phòng bảo vệ giả định → chấm điểm → xuất PDF báo cáo.

| Khoản mục | Giá trị |
|-----------|---------|
| Timeline | 3 tuần MVP |
| Team | 3 developers (Quý, Dev A, Dev C) |
| Frontend | Next.js 14 + Tailwind + shadcn/ui |
| Backend | Python FastAPI |
| Database | PostgreSQL |
| AI Engine | OpenAI GPT-4o / Gemini 1.5 Pro |
| Video Call | Jitsi Meet API |

---

## Cấu trúc tài liệu

```
docs/
├── README.md                 ◀ BẠN ĐANG Ở ĐÂY — Entry point
├── ARCHITECTURE_INDEX.md     ◀ AI Agent index (đọc trước khi code)
│
├── architecture/              ← Kiến trúc hệ thống
│   ├── 01-system-overview.md
│   ├── 02-tech-stack.md
│   ├── 03-module-design.md
│   ├── 04-folder-structure.md
│   ├── 05-backend.md
│   ├── 06-frontend.md
│   ├── 07-ai-architecture.md
│   ├── 08-rag.md
│   ├── 09-code-analysis.md
│   ├── 10-mock-defense.md
│   ├── 11-database.md
│   ├── 12-api-design.md
│   ├── 13-deployment.md
│   ├── 14-scalability.md
│   └── 15-future-roadmap.md
│
├── decisions/                 ← Architecture Decision Records
│   ├── ADR-001-postgresql.md
│   ├── ADR-002-ai-gateway.md
│   ├── ADR-003-vertical-slices.md
│   ├── ADR-004-jitsi.md
│   └── ADR-005-no-auth-mvp.md
│
├── diagrams/                  ← Mermaid diagrams
│   ├── system.mmd
│   ├── deployment.mmd
│   └── sequence.mmd
│
├── REQUIREMENT.md             ← Yêu cầu chi tiết
└── FUNCTIONS.md               ← 19 functions MVP
```

---

## Reading Order

Dành cho **developer mới** — đọc theo thứ tự:

```
1. 01-system-overview.md      ← Hiểu context tổng thể
2. 02-tech-stack.md            ← Biết công nghệ và lý do chọn
3. 03-module-design.md         ← Hiểu module và trách nhiệm
4. 05-backend.md               ← Backend architecture
5. 06-frontend.md              ← Frontend architecture
6. 07-ai-architecture.md       ← AI Pipeline
7. 11-database.md              ← Database schema
8. 13-deployment.md            ← Cách chạy
9. 14-scalability.md           ← Scale plan
```

Dành cho **AI Agent** — đọc `ARCHITECTURE_INDEX.md` trước.

---

## Quick Navigation

| Bạn cần | Đọc file |
|---------|----------|
| Hiểu tổng quan hệ thống | `architecture/01-system-overview.md` |
| Chọn tech stack | `architecture/02-tech-stack.md` |
| Thiết kế module | `architecture/03-module-design.md` |
| Cấu trúc folder | `architecture/04-folder-structure.md` |
| Backend API | `architecture/05-backend.md` |
| Frontend UI | `architecture/06-frontend.md` |
| AI Gateway + Prompts | `architecture/07-ai-architecture.md` |
| RAG pipeline | `architecture/08-rag.md` |
| Code analysis | `architecture/09-code-analysis.md` |
| Mock Defense Room | `architecture/10-mock-defense.md` |
| Database schema | `architecture/11-database.md` |
| API endpoints | `architecture/12-api-design.md` |
| Deploy | `architecture/13-deployment.md` |
| Scale plan | `architecture/14-scalability.md` |
| Future roadmap | `architecture/15-future-roadmap.md` |
| Yêu cầu chi tiết | `REQUIREMENT.md` |
| Danh sách functions | `FUNCTIONS.md` |
| Lý do quyết định | `decisions/` |

---

## Related Documents

| File | Mô tả |
|------|-------|
| `../MVP_PLAN.md` | Timeline 3 tuần + phân công dev |
| `../tasks/week-1/` | Task chi tiết tuần 1 cho từng dev |
| `REQUIREMENT.md` | Yêu cầu chi tiết từng tính năng |
| `FUNCTIONS.md` | 19 functions cần xây dựng |