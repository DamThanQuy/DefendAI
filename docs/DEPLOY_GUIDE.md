# DefendAI - Hướng dẫn Deploy (100% Free)

## Tổng quan kiến trúc

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Vercel     │─────▶│   Render     │─────▶│   Supabase   │
│  Frontend    │      │   Backend    │      │  PostgreSQL   │
│  Next.js 14  │      │   FastAPI    │      │              │
│    FREE      │      │  FREE tier   │      │    FREE      │
└──────────────┘      └──────────────┘      └──────────────┘
        ▲                     ▲
        │  auto deploy        │  auto deploy
   ┌────┴─────┐        ┌─────┴──────┐
   │  Vercel  │        │  Render    │
   │  CI hook │        │  CI hook   │
   └────┬─────┘        └─────┬──────┘
        │                     │
        └──────────┬──────────┘
                   │
          ┌────────┴────────┐
          │ GitHub Actions  │
          │   CI Pipeline   │
          │      FREE       │
          └─────────────────┘
```

| Service | Platform | Free Limit |
|---------|----------|------------|
| CI/CD | GitHub Actions | 2000 mins/tháng |
| Frontend | Vercel | Unlimited hobby projects |
| Backend | Render | 750 hrs/tháng, spin down 15p idle |
| Database | Supabase | 500MB PostgreSQL |

---

## Bước 0: Push code lên GitHub

Tất cả các nền tảng deploy đều cần code trên GitHub.

```bash
cd d:\STUDY\KY7\EXE101\DefendAI
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<YOUR_USERNAME>/DefendAI.git
git push -u origin main
```

---

## Bước 1: CI/CD với GitHub Actions (Free) ✅ HOÀN THÀNH

> **Status: ĐÃ HOÀN THÀNH** — CI pipeline đang chạy, tất cả jobs pass.
> Repo: https://github.com/DamThanQuy/DefendAI/actions
> Run gần nhất: `CI - Build & Test #4` — ✅ success

CI/CD đảm bảo code mới được kiểm tra trước khi deploy, tránh break production. **Nên setup trước** để các bước deploy sau có auto deploy.

### 1.1 Cách hoạt động

```
git push to main
       │
       ▼
┌─────────────────────────────────────────┐
│          GitHub Actions CI              │
│                                         │
│  Job 1: Backend                         │
│  ├─ Lint (Ruff)                         │
│  ├─ Test (FastAPI TestClient)           │
│  └─ Build Docker image                  │
│                                         │
│  Job 2: Frontend                        │
│  ├─ Lint (ESLint)                       │
│  ├─ Type check (TypeScript)             │
│  └─ Build (next build)                  │
│                                         │
│  Job 3: Deploy Gate                     │
│  └─ Cả 2 job trên pass → Auto deploy   │
└─────────────────────────────────────────┘
       │
       ▼
Render (BE) + Vercel (FE) auto deploy
```

### 1.2 File CI/CD

File đã tạo sẵn: `.github/workflows/ci.yml`

Nội dung chính:

| Job | Kiểm tra | Cần thiết |
|-----|----------|-----------|
| **Backend** | Ruff lint, test, Docker build | PostgreSQL service container |
| **Frontend** | ESLint, TypeScript check, Next.js build | Node.js 20 |
| **Deploy Gate** | Cả 2 job pass mới deploy | Chạy trên push to main |

### 1.3 Kích hoạt GitHub Actions

1. Vào repo GitHub → tab **Actions**
2. Click **"I understand my workflows, go ahead and enable them"**

### 1.4 Verify CI chạy đúng

```bash
# Tạo commit test
git commit --allow-empty -m "test: verify CI pipeline"
git push origin main
```

→ Vào repo GitHub → tab **Actions** → xem workflow đang chạy.

---

## Bước 2: Tạo Database trên Supabase (Free)

### 2.1 Tạo project

1. Vào [https://supabase.com](https://supabase.com) → Sign in with GitHub
2. Click **"New Project"**
3. Cài đặt:
   - **Organization**: Chọn hoặc tạo mới
   - **Project name**: `defendai-db`
   - **Database password**: Nhập password mạnh (ghi nhớ!)
   - **Region**: `Southeast Asia (Singapore)` — gần VN nhất
4. Click **Create new project** → chờ ~2 phút

### 2.2 Lấy Connection String

1. Vào **Project** → **Settings** (biểu tượng răng cưa) → **Database**
2. Scroll xuống **Connection string** → tab **URI**
3. Copy connection string:

```
postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

> **QUAN TRỌNG**: Thay `[YOUR-PASSWORD]` bằng password thật khi dùng. Dùng port **6543** (Transaction mode).

### 2.3 Tạo database schema

Bạn có 2 cách:

**Cách A: Dùng Supabase SQL Editor (Khuyến nghị)**

1. Vào **SQL Editor** trên Dashboard Supabase
2. Copy nội dung từ file migration và paste vào → Run

**Cách B: Dùng Alembic trên máy local**

```bash
cd apps/api

# Set DATABASE_URL trỏ đến Supabase
set DATABASE_URL=postgresql+asyncpg://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# Chạy migration
alembic upgrade head
```

### 2.4 Verify

Vào **Table Editor** trên Supabase Dashboard → kiểm tra tất cả tables đã được tạo.

---

## Bước 3: Deploy Backend lên Render (Free)

### 3.1 Tạo tài khoản Render

1. Vào [https://render.com](https://render.com) → Sign up with GitHub
2. Free plan được 750 hrs/tháng

### 3.2 Tạo Web Service

1. Dashboard → **New +** → **Web Service**
2. Connect GitHub repo → chọn repo `DefendAI`
3. Cài đặt:

| Field | Giá trị |
|-------|---------|
| **Name** | `defendai-api` |
| **Region** | Singapore (or closest) |
| **Branch** | `main` |
| **Runtime** | `Docker` |
| **Dockerfile Path** | `apps/api/Dockerfile` |
| **Instance Type** | `Free` |

4. Scroll xuống **Environment Variables** → thêm:

```
DATABASE_URL          = postgresql+asyncpg://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
GOOGLE_API_KEY        = your-google-api-key
NVIDIA_API_KEY        = your-nvidia-api-key
DEFAULT_PROVIDER      = google
ORCHESTRATOR_PROVIDER = nvidia
SECRET_KEY            = random-secret-key-here
ALGORITHM             = HS256
ACCESS_TOKEN_EXPIRE_MINUTES = 30
```

> **Lưu ý SECRET_KEY**: Tạo secret key ngẫu nhiên. Trên PowerShell chạy:
> ```powershell
> python -c "import secrets; print(secrets.token_hex(32))"
> ```

5. Click **Create Web Service**
6. Chờ build (~3-5 phút lần đầu)

### 3.3 Kết nối Render với GitHub Actions (Auto Deploy)

Để CI/CD auto deploy khi code pass tests:

1. Render Dashboard → Service `defendai-api` → **Settings**
2. Scroll đến **Build & Deploy** → đảm bảo **Auto Deploy** = `Yes`
3. Branch: `main`

→ Từ giờ, mỗi push to main mà CI pass → Render tự rebuild.

### 3.4 Lấy Backend URL

Sau khi deploy thành công, Render sẽ cấp URL:

```
https://defendai-api-xxxx.onrender.com
```

→ Truy cập `https://defendai-api-xxxx.onrender.com/health` để kiểm tra.

### 3.5 Vấn đề Cold Start

Render Free sẽ **sleep server sau 15 phút idle**. Lần request đầu tiên mất ~30-60s.

**Giải pháp: Dùng UptimeRobot để server luôn wake**

1. Vào [https://uptimerobot.com](https://uptimerobot.com) → Sign up free
2. **Add New Monitor**:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: DefendAI API
   - **URL**: `https://defendai-api-xxxx.onrender.com/health`
   - **Monitoring Interval**: 5 minutes
3. Save → Server sẽ được ping mỗi 5 phút, không bao giờ sleep

---

## Bước 4: Deploy Frontend lên Vercel (Free)

### 4.1 Tạo tài khoản Vercel

1. Vào [https://vercel.com](https://vercel.com) → Sign up with GitHub
2. Free plan cho hobby projects

### 4.2 Import project

1. Dashboard → **Add New...** → **Project**
2. Import GitHub repo `DefendAI`
3. Cài đặt:

| Field | Giá trị |
|-------|---------|
| **Framework Preset** | Next.js |
| **Root Directory** | `apps/web` |
| **Build Command** | `npm run build` |
| **Output Directory** | `.next` |

4. Scroll xuống **Environment Variables** → thêm:

```
NEXT_PUBLIC_API_URL = https://defendai-api-xxxx.onrender.com
```

> **QUAN TRỌNG**: URL phải có `https://` và **KHÔNG** có `/` ở cuối

5. Click **Deploy**
6. Chờ build (~2-3 phút)

### 4.3 Kết nối Vercel với GitHub Actions (Auto Deploy)

1. Vercel Dashboard → Project → **Settings** → **Git**
2. Ensure repo đã connected, **Production Branch** = `main`

→ Từ giờ, mỗi push to main mà CI pass → Vercel tự rebuild.

### 4.4 Lấy Frontend URL

Vercel sẽ cấp URL:

```
https://defendai-xxxx.vercel.app
```

### 4.5 Cập nhật Backend CORS

Vào file `apps/api/app/main.py`, sửa `allow_origins` để chỉ cho phép frontend domain:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://defendai-xxxx.vercel.app",
        "http://localhost:3000",  # Local dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

→ Push code → CI chạy → pass → Render tự rebuild.

---

## Bước 5: Verify toàn bộ

### Checklist

| # | Kiểm tra | URL | Kết quả |
|---|---------|-----|---------|
| 1 | CI/CD | GitHub → Actions tab | Tất cả jobs ✅ |
| 2 | Backend health | `https://defendai-api-xxxx.onrender.com/health` | `{"status":"healthy"}` |
| 3 | Backend docs | `https://defendai-api-xxxx.onrender.com/docs` | Swagger UI |
| 4 | Frontend | `https://defendai-xxxx.vercel.app` | Trang chủ |
| 5 | FE gọi BE | Mở Console (F12) trên FE | Không có CORS error |
| 6 | Supabase DB | Supabase Dashboard → Table Editor | Có data |

### Test flow

1. Mở frontend → Đăng ký tài khoản
2. Đăng nhập
3. Upload tài liệu
4. Generate câu hỏi
5. Scan code

---

## Troubleshooting

### CI fail

- Vào GitHub → Actions → click vào workflow fail → xem step nào lỗi
- **Backend lint fail**: Chạy `ruff check app/` local để fix
- **Frontend lint fail**: Chạy `npm run lint` local để fix
- **Build fail**: Kiểm tra dependency thiếu hoặc lỗi syntax

### BE không start được

- Vào Render Dashboard → **Logs** để xem lỗi
- Thường do thiếu env variable hoặc DATABASE_URL sai

### CORS Error

- Kiểm tra `allow_origins` trong `main.py` đã có domain Vercel chưa
- Đảm bảo push code sau khi sửa → CI pass → Render auto rebuild

### Cold Start quá chậm

- Đảm bảo UptimeRobot đang ping
- Kiểm tra UptimeRobot Dashboard → monitor status là "Up"

### Supabase connection timeout

- Dùng port **6543** (Transaction mode) cho serverless/Render
- Nếu không được, thử port **5432** (Session mode)

---

## Workflow khi phát triển (Sau khi setup xong)

```bash
# 1. Tạo branch mới cho feature
git checkout -b feature/new-feature

# 2. Code + test local
# ...

# 3. Push lên GitHub
git push origin feature/new-feature

# 4. Tạo Pull Request → CI tự chạy
#    → Nếu CI fail → fix code
#    → Nếu CI pass → Review + Merge

# 5. Merge PR → CI chạy lại trên main
#    → Cả 2 job pass → Auto deploy lên Render + Vercel
```

### Xem kết quả CI

- Vào repo GitHub → tab **Actions**
- Click vào workflow run để xem chi tiết
- Nếu có icon ✅ = pass, ❌ = fail → click vào để xem lỗi

### Skip CI (nếu cần)

```bash
# Commit không cần chạy CI (documentation change)
git commit -m "docs: update README [skip ci]"
```

---

## Chi phí tổng kết

| Service | Platform | Chi phí/tháng |
|---------|----------|---------------|
| CI/CD | GitHub Actions | $0 (2000 mins/tháng free) |
| Frontend | Vercel | $0 |
| Backend | Render | $0 |
| Database | Supabase | $0 |
| UptimeRobot | UptimeRobot | $0 |
| AI API | Google/NVIDIA | Free tier |
| **Tổng** | | **$0** |

---

## Cấu trúc env summary

### Supabase
```
DATABASE_URL=postgresql+asyncpg://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

### Render (Backend env vars)
```
DATABASE_URL=<supabase connection string>
GOOGLE_API_KEY=<your key>
NVIDIA_API_KEY=<your key>
DEFAULT_PROVIDER=google
ORCHESTRATOR_PROVIDER=nvidia
SECRET_KEY=<random hex>
```

### Vercel (Frontend env vars)
```
NEXT_PUBLIC_API_URL=https://defendai-api-xxxx.onrender.com
```
