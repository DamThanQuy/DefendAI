# AI-Powered Project Defense System

Hệ thống hỗ trợ sinh viên chuẩn bị bảo vệ đồ án tốt nghiệp bằng AI.

## Cấu trúc dự án (Monorepo)

```
EXE101/
├── apps/
│   ├── web/                  # Frontend - Next.js + React + Tailwind CSS
│   │   ├── src/
│   │   │   ├── app/          # App Router (Next.js 13+)
│   │   │   ├── components/   # Shared UI components
│   │   │   ├── hooks/        # Custom React hooks
│   │   │   ├── lib/          # Utilities (axios, etc.)
│   │   │   └── types/        # TypeScript types
│   │   ├── public/           # Static assets
│   │   └── package.json
│   │
│   └── api/                  # Backend - Python FastAPI
│       ├── app/
│       │   ├── routers/        # API endpoints
│       │   ├── models/         # Database models
│       │   ├── schemas/        # Pydantic schemas
│       │   ├── services/       # Business logic
│       │   ├── core/           # Config, auth, utils
│       │   └── main.py         # Entry point
│       ├── tests/
│       ├── requirements.txt
│       └── Dockerfile
│
├── packages/                 # Shared code
│   └── types/                # Shared TypeScript types (nếu cần)
│
├── docs/                     # Tài liệu dự án
├── docker-compose.yml        # Khởi chạy toàn bộ hệ thống
└── MVP_PLAN.md             # Kế hoạch MVP 3 tuần
```

## Phân công Dev

| Dev | Vai trò | Focus |
|-----|---------|-------|
| **Dev A** | Lead Frontend | `apps/web/` |
| **Dev B** | AI Engineer | `apps/api/` (AI Pipeline, Prompts) |
| **Dev C** | Fullstack Integration | DB, Auth, WebSocket, DevOps |

## Quick Start

### 1. Clone & Setup

```bash
git clone <repo-url>
cd EXE101

# Install dependencies
cd apps/web && npm install
cd ../api && pip install -r requirements.txt
```

### 2. Environment Variables

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000

# apps/api/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/defense_db
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...
```

### 3. Run Development

```bash
# Terminal 1: Backend
cd apps/api
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd apps/web
npm run dev
```

## Luồng git workflow

```bash
# Mỗi dev làm việc trên branch riêng
git checkout -b feature/ten-tinh-nang

# Commit & push
git add .
git commit -m "feat: mô tả ngắn"
git push origin feature/ten-tinh-nang

# Tạo Pull Request → Review → Merge vào main
```

## Luồng phát triển

```
Upload Đồ án → AI Phân tích → Mock Defense Room → Chấm điểm → PDF Report
```

## Milestones

| Milestone | Deadline | Criteria |
|-----------|----------|----------|
| M1: AI Pipeline | Ngày 7 | Upload PDF → 10 câu hỏi + gợi ý |
| M2: Mock Room | Ngày 14 | Video + Timer 3 phase + Phân quyền |
| M3: Report PDF | Ngày 21 | Chấm điểm → Radar → PDF |

---

*Xem chi tiết plan tại `MVP_PLAN.md`*