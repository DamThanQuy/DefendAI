# 🏗 Kiến trúc Hệ thống — DefendAI

> Kiến trúc tổng thể cho MVP 3 tuần.
> **Nguyên tắc:** Đơn giản, dễ mở rộng, không over-engineering.

---

## 1. Tổng quan kiến trúc (High-level)

```
┌─────────────────────────────────────────────────────────┐
│                     Browser / Client                      │
│   ┌───────────────────────────────────────────────────┐  │
│   │              Next.js Frontend (React)              │  │
│   │  Port 3000                                        │  │
│   └──────────────┬──────────────────┬─────────────────┘  │
│                  │ HTTP REST        │ WebSocket           │
└──────────────────┼──────────────────┼─────────────────────┘
                   │                  │
                   ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI Backend (Python)                     │
│  Port 8000                                              │
│                                                          │
│  ┌────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ Routers/    │  │ Services/      │  │ Models/       │  │
│  │ questions   │──│ question_gen   │──│ Document      │  │
│  │ code_review │──│ code_reviewer  │  │ Session       │  │
│  │ documents   │──│ document_parser│  └───────┬───────┘  │
│  │ ws          │  │ code_parser    │          │           │
│  └────────────┘  │ ai_client      │          │           │
│                  └────────────────┘          │           │
└──────────────────────────────────────────────┼───────────┘
                                               │
                                               ▼
                               ┌─────────────────────────┐
                               │    PostgreSQL            │
                               │    (hoặc MongoDB)        │
                               │    Port 5432             │
                               └─────────────────────────┘
```

---

## 2. Kiến trúc Frontend (Next.js)

### 2.1 Cấu trúc thư mục
```
apps/web/src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Trang chủ (Upload)
│   ├── layout.tsx          # Root layout
│   ├── questions/          # Trang kết quả câu hỏi AI
│   │   └── page.tsx
│   ├── code-review/        # Trang kết quả scan code
│   │   └── page.tsx
│   ├── room/               # Trang Mock Defense Room
│   │   └── page.tsx
│   └── report/             # Trang báo cáo / PDF
│       └── page.tsx
├── components/
│   ├── ui/                 # UI Kit: Button, Card, Modal, Spinner
│   ├── upload/             # UploadZone, FilePreview
│   ├── questions/          # QuestionList, QuestionCard, PersonaTab
│   ├── code-review/        # CodeReviewResult, IssueCard
│   ├── room/               # VideoCall, Timer, RoleSelector
│   └── report/             # RadarChart, PDFExport
├── hooks/                  # Custom hooks (useWebSocket, useTimer...)
├── lib/                    # Axios instance, helpers
└── types/                  # TypeScript types
```

### 2.2 Luồng dữ liệu Frontend
```
User → Page Component → Hook (gọi API) → Backend → Response → Render UI
                                   ↕ (nếu realtime)
                            WebSocket → Hook → State Update → Re-render
```

---

## 3. Kiến trúc Backend (FastAPI)

### 3.1 Cấu trúc thư mục
```
apps/api/app/
├── main.py                    # Entry point, CORS, register routers
├── core/
│   ├── config.py              # Settings từ env
│   ├── database.py            # Kết nối DB (SQLAlchemy)
│   └── security.py            # JWT helpers (cho sau MVP)
├── models/                    # SQLAlchemy models
│   ├── __init__.py
│   ├── user.py
│   ├── document.py
│   └── session.py
├── schemas/                   # Pydantic models (request/response)
│   ├── question.py
│   ├── code_review.py
│   └── document.py
├── routers/                   # API endpoints
│   ├── questions.py           # POST /api/questions/generate
│   ├── code_review.py         # POST /api/code/scan
│   ├── documents.py           # POST /api/documents/upload, GET /api/documents/{id}
│   └── ws.py                  # WebSocket: ws://localhost:8000/ws
└── services/                  # Business logic
    ├── ai_client.py           # OpenAI/Gemini wrapper
    ├── document_parser.py     # Parse PDF/DOCX/PPTX → text
    ├── code_parser.py         # Unzip .zip, đọc file code → text
    ├── question_generator.py  # AI prompt → 10 câu hỏi
    └── code_reviewer.py       # AI prompt → review code
```

### 3.2 Luồng xử lý API (Ví dụ: Generate Questions)
```
Client → POST /api/questions/generate { document_id, persona }
                │
                ▼
    Router (questions.py) nhận request
                │
                ▼
    Service (question_generator.py)
        ├── document_parser.py (parse file → text)
        ├── ai_client.py (gọi OpenAI/Gemini với prompt persona)
        └── Parse response JSON
                │
                ▼
    Return { questions: [...], document_summary: "..." }
                │
                ▼
    Client render UI
```

---

## 4. Database Schema

```sql
-- Bảng documents (dùng chung cho tài liệu và source code)
CREATE TABLE documents (
    id            SERIAL PRIMARY KEY,
    filename      VARCHAR(255) NOT NULL,      -- tên file gốc
    file_path     VARCHAR(500) NOT NULL,      -- đường dẫn lưu trên disk
    file_type     VARCHAR(50) NOT NULL,       -- pdf|docx|pptx|zip
    doc_type      VARCHAR(20) DEFAULT 'document',  -- document | code
    file_size     BIGINT NOT NULL,            -- bytes
    status        VARCHAR(20) DEFAULT 'pending',   -- pending|processing|done|error
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Bảng sessions (Mock Defense Room - Tuần 2)
CREATE TABLE sessions (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255),
    status        VARCHAR(20) DEFAULT 'waiting',  -- waiting|presentation|qa|review|done
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Bảng scores (kết quả chấm điểm - Tuần 3)
CREATE TABLE scores (
    id            SERIAL PRIMARY KEY,
    session_id    INTEGER REFERENCES sessions(id),
    knowledge     INTEGER CHECK (knowledge BETWEEN 1 AND 10),
    presentation  INTEGER CHECK (presentation BETWEEN 1 AND 10),
    reflex        INTEGER CHECK (reflex BETWEEN 1 AND 10),
    code_quality  INTEGER CHECK (code_quality BETWEEN 1 AND 10),
    reviewer_name VARCHAR(255),
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Bảng reports (báo cáo PDF - Tuần 3)
CREATE TABLE reports (
    id            SERIAL PRIMARY KEY,
    session_id    INTEGER REFERENCES sessions(id),
    pdf_path      VARCHAR(500),
    pass_rate     DECIMAL(5,2),
    created_at    TIMESTAMP DEFAULT NOW()
);
```

---

## 5. Luồng dữ liệu tổng thể (Data Flow)

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Upload   │───▶│ Parse    │───▶│ AI Phân  │───▶│ Render   │
│ .pdf/.zip│    │ text/code│    │ tích     │    │ UI       │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                    │
                                                    ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Mock     │───▶│ Chấm     │───▶│ AI Review│───▶│ PDF      │
│ Defense  │    │ điểm     │    │ tổng kết │    │ Report   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## 6. Công nghệ & Lý do chọn

| Layer | Công nghệ | Lý do |
|-------|-----------|-------|
| **Frontend** | Next.js 14 + Tailwind CSS | SSR tốt cho SEO, Tailwind nhanh cho MVP |
| **Backend** | Python FastAPI | Tối ưu cho AI, async, tự động Swagger docs |
| **Database** | PostgreSQL | Quan hệ, phù hợp cho dữ liệu có cấu trúc |
| **AI Engine** | OpenAI GPT-4o / Gemini 1.5 Pro | Xử lý tài liệu lớn, prompt engineering linh hoạt |
| **Video Call** | Jitsi Meet API | Free, open-source, không cần backend riêng |
| **Charts** | Chart.js | Nhẹ, đủ cho Radar Chart |
| **PDF** | jsPDF / pdfmake | Client-side, không cần server xử lý PDF |
| **WebSocket** | FastAPI native | Có sẵn trong FastAPI, không cần thêm thư viện |

---

## 7. Môi trường & Triển khai

### Development
- Frontend: `localhost:3000` (npm run dev)
- Backend: `localhost:8000` (uvicorn --reload)
- Database: `localhost:5432` (Docker PostgreSQL)
- Docker Compose chạy đồng thời cả 3

### Production (cho sau MVP)
- Frontend: Vercel / Netlify
- Backend: Railway / Render / VPS
- Database: Supabase / AWS RDS

---

## 8. Nguyên tắc kiến trúc

1. **Stateless Backend** — API không lưu state, scale ngang dễ dàng
2. **WebSocket chỉ cho real-time** — Timer, phase transitions (không dùng cho upload)
3. **AI không block request** — Xử lý AI đồng bộ (do MVP chưa cần queue), nhưng có timeout
4. **File lưu disk, không lưu DB** — DB chỉ lưu metadata, file lưu `uploads/`
5. **Không Auth trong MVP** — Mọi người dùng đều là anonymous cho đến khi có login

---

*Xem chi tiết functions tại [`FUNCTIONS.md`](FUNCTIONS.md)*
*Xem requirement tại [`REQUIREMENT.md`](REQUIREMENT.md)*
*Xem timeline tại [`MVP_PLAN.md`](../MVP_PLAN.md)*