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

## Yêu cầu (Prerequisites)

Chọn **1 trong 2 cách**:

| Cách | Yêu cầu | Ghi chú |
|------|---------|---------|
| **A. Docker (Khuyên dùng)** | Docker Desktop | Không cần cài gì thêm |
| **B. Manual** | Node 18+, Python 3.11+, PostgreSQL 15+ | Cài từng thứ riêng |

---

## Cách A: Chạy bằng Docker (Khuyên dùng cho người mới)

Docker giúp bạn chạy toàn bộ hệ thống (FE + BE + DB) chỉ với 1 lệnh, không cần cài Node/Python/PostgreSQL thủ công.

### 1. Cài Docker (nếu chưa có)

| OS | Hướng dẫn |
|----|-----------|
| **Windows / Mac** | Tải [Docker Desktop](https://www.docker.com/products/docker-desktop/), cài đặt, khởi động |
| **Linux** | `sudo apt install docker.io docker-compose-v2` |

Kiểm tra đã cài xong:
```powershell
docker --version
```
Nếu ra số phiên bản là OK.

### 2. Clone project

```powershell
git clone <repo-url>
cd DefendAI
```

### 3. Tạo file .env

Copy file mẫu rồi điền API key:
```powershell
cp .env.example .env
```

Mở file `.env` và điền key:
```
NVIDIA_API_KEY=nvapi-xxx...
GOOGLE_API_KEY=AIzaxxx...
```

### 4. Chạy toàn bộ hệ thống (lần đầu)

```powershell
docker compose up --build
```
- **Lần đầu chạy rất lâu** (vài phút) vì phải tải image + cài dependencies
- Lần sau chỉ cần `docker compose up` (nhanh hơn)

### 5. Chạy migration + seed database

Mở terminal khác và gõ:
```powershell
docker compose exec api alembic upgrade head
docker compose exec api python scripts/seed.py
```

### 6. Mở trình duyệt

| Ứng dụng | URL |
|----------|-----|
| **Frontend** | http://localhost:3000 |
| **API Docs (Swagger)** | http://localhost:8000/docs |
| **Database** | localhost:5433 (user: postgres, pass: postgres) |

### Docker commands thường dùng

| Lệnh | Mô tả |
|------|-------|
| `docker compose up` | Chạy hệ thống |
| `docker compose up -d` | Chạy ngầm (không log) |
| `docker compose down` | Tắt toàn bộ |
| `docker compose logs -f` | Xem log realtime |
| `docker compose logs api -f` | Xem log riêng backend |
| `docker compose exec api python scripts/seed.py` | Chạy lệnh trong container backend |

---

## Cách B: Chạy thủ công (Manual)

Dành cho ai đã có sẵn Node, Python, PostgreSQL.

### 1. Clone & Install

```powershell
git clone <repo-url>
cd DefendAI/apps/web; npm install
cd ../api; pip install -r requirements.txt
```

### 2. Tạo database PostgreSQL

Mở pgAdmin hoặc command line:
```sql
CREATE DATABASE defense_db;
```

### 3. Environment Variables

Tạo file `apps/api/.env`:
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/defense_db
NVIDIA_API_KEY=nvapi-xxx...
GOOGLE_API_KEY=AIzaxxx...
SECRET_KEY=your-secret-key
```

Tạo file `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Migration & Seed

```powershell
cd apps/api; alembic upgrade head
cd apps/api; python scripts/seed.py
```

### 5. Run

```powershell
# Terminal 1: Backend
cd apps/api; uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd apps/web; npm run dev
```

---

## Troubleshooting (Lỗi thường gặp)

| Lỗi | Nguyên nhân | Fix |
|-----|------------|-----|
| `port 3000/8000 already in use` | Port bị ứng dụng khác chiếm | Tắt app đó hoặc đổi port khác |
| `'docker' is not recognized` | Chưa cài Docker | Cài Docker Desktop, khởi động lại terminal |
| `Cannot connect to database` | DB chưa chạy hoặc sai URL | Kiểm tra `docker compose ps` hoặc DATABASE_URL |
| `ModuleNotFoundError: ...` | Thiếu dependencies | Chạy `pip install -r requirements.txt` |

---

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
*Xem các lệnh thường dùng tại `docs/DEV_NOTES.md`*
