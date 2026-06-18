# DefendAI - Hướng dẫn Deploy lên máy cá nhân Windows

## Tổng quan kiến trúc

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Browser    │─────▶│   Backend    │─────▶│   Database   │
│  localhost   │      │  FastAPI     │      │  PostgreSQL  │
│  :3000       │      │  :8000       │      │  :5433       │
└──────────────┘      └──────────────┘      └──────────────┘
     (FE)                  (BE)                   (DB)
  Next.js 14          Python 3.12           PostgreSQL 16
```

Tất cả chạy trên **1 máy**, dùng Docker Compose để quản lý.

---

## Bước 0: Yêu cầu phần mềm cần cài đặt

### 0.1 Docker Desktop (Bắt buộc)

1. Tải: https://www.docker.com/products/docker-desktop/
2. Cài đặt → Restart máy
3. Mở Docker Desktop → đảm bảo có icon Docker trong system tray
4. Verify:
   ```powershell
   docker --version
   # Docker version 27.x.x+
   
   docker compose version
   # Docker Compose version v2.x.x+
   ```

> **Lưu ý**: Docker Desktop yêu cầu **WSL2** hoặc **Hyper-V**. Nếu chưa có, installer sẽ hỏi bật. Chọn **WSL2** (được推荐).

### 0.2 Git (Nếu chưa có)

1. Tải: https://git-scm.com/download/win
2. Cài đặt mặc định
3. Verify:
   ```powershell
   git --version
   ```

### 0.3 API Keys (Bắt buộc最少 1 key)

Bạn cần ít nhất 1 trong 2 API key để AI hoạt động:

| Provider | Nhận key tại | Free |
|----------|--------------|------|
| **Google AI Studio** | https://aistudio.google.com/apikey | 60 req/phút |
| **NVIDIA NIM** | https://build.nvidia.com/ | Free credits |

---

## Bước 1: Clone project

```powershell
# Chọn thư mục muốn đặt project
cd d:\STUDY\KY7

# Clone từ GitHub
git clone https://github.com/DamThanQuy/DefendAI.git

# Vào thư mục
cd DefendAI
```

---

## Bước 2: Cấu hình biến môi trường

### 2.1 Tạo file `.env` từ template

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI
Copy-Item .env.example .env
```

### 2.2 Chỉnh sửa file `.env`

Mở file `.env` bằng Notepad hoặc VS Code:

```powershell
notepad .env
```

Nội dung file `.env`:

```env
# Database (Docker internal, KHÔNG cần sửa)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/defense_db

# AI API Keys (NHẬP ÍT NHẤT 1 KEY)
GOOGLE_API_KEY=your-google-api-key-here
NVIDIA_API_KEY=your-nvidia-api-key-here

# Routing (giữ nguyên)
DEFAULT_PROVIDER=google
ORCHESTRATOR_PROVIDER=nvidia

# Auth (tạo SECRET_KEY mới)
# Chạy lệnh sau để tạo key ngẫu nhiên:
# python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=change-this-to-random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### 2.3 Tạo SECRET_KEY

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Copy kết quả → paste vào `SECRET_KEY` trong file `.env`.

---

## Bước 3: Khởi chạy toàn bộ hệ thống

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI

# Build và chạy tất cả services
docker compose up --build
```

Lần đầu sẽ **mất 3-5 phút** để:
- Tải image PostgreSQL
- Build Docker image cho Backend và Frontend
- Cài dependencies

Khi thấy类似 dòng này nghĩa là thành công:

```
defense-api   | INFO:     Uvicorn running on http://0.0.0.0:8000
defense-web   | ready - started server on 0.0.0.0:3000
defense-db    | ready to accept connections
```

---

## Bước 4: Tạo Database Schema (Chạy 1 lần duy nhất)

Mở terminal **mới** (không phải terminal đang chạy docker compose):

```powershell
# Vào thư mục API
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api

# Chạy migration để tạo tables
docker compose exec api alembic upgrade head
```

Nếu không dùng docker compose exec, có thể chạy trực tiếp:

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
pip install -r requirements.txt
set DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/defense_db
alembic upgrade head
```

> **Lưu ý port**: Khi chạy ngoài Docker, PostgreSQL listen trên port **5433** (đã map từ container 5432).

---

## Bước 5: Kiểm tra hoạt động

### 5.1 Kiểm tra Backend

Mở browser, truy cập:

```
http://localhost:8000/health
```

Kết quả mong đợi:
```json
{
  "status": "healthy",
  "ai_providers": ["google", "nvidia"],
  "ai_ready": true,
  "debug_env_detected": {
    "google": true,
    "nvidia": true
  }
}
```

### 5.2 Kiểm tra Swagger UI

```
http://localhost:8000/docs
```

### 5.3 Kiểm tra Frontend

```
http://localhost:3000
```

### 5.4 Kiểm tra Database

```powershell
# Kết nối vào container PostgreSQL
docker compose exec db psql -U postgres -d defense_db

# Xem tables
\dt

# Thoát
\q
```

### 5.5 Test Flow hoàn chỉnh

1. Mở `http://localhost:3000`
2. Đăng ký tài khoản mới
3. Đăng nhập
4. Upload tài liệu (PDF, DOCX, PPTX)
5. Generate câu hỏi
6. Scan code

---

## Bước 6: Quản lý hệ thống

### Các lệnh thường dùng

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI

# Khởi chạy (foreground - xem log)
docker compose up --build

# Khởi chạy (background - ẩn terminal)
docker compose up --build -d

# Dừng tất cả services
docker compose down

# Dừng và xóa data (reset database)
docker compose down -v

# Xem log realtime
docker compose logs -f

# Xem log của 1 service cụ thể
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db

# Restart 1 service
docker compose restart api

# Rebuild 1 service
docker compose up --build api
```

### Port mapping

| Service | Container Port | Host Port | URL |
|---------|---------------|-----------|-----|
| Frontend (Next.js) | 3000 | 3000 | http://localhost:3000 |
| Backend (FastAPI) | 8000 | 8000 | http://localhost:8000 |
| Database (PostgreSQL) | 5432 | 5433 | localhost:5433 |

---

## Xử lý lỗi phổ biến

### Lỗi 1: Docker không start được

**Triệu chứng**: `docker: command not found` hoặc Docker Desktop không mở

**Giải pháp**:
1. Mở Docker Desktop
2. Đợi icon Docker trong system tray chuyển thành **đông** (không phải loading)
3. Nếu vẫn lỗi: Restart Docker Desktop

### Lỗi 2: Port đã bị chiếm

**Triệu chứng**: `Bind for 0.0.0.0:8000 failed: port is already allocated`

**Giải pháp**:
```powershell
# Tìm process đang dùng port 8000
netstat -ano | findstr :8000

# Kill process theo PID (thay <PID> bằng số PID tìm được)
taskkill /PID <PID> /F
```

Hoặc sửa port trong `docker-compose.yml`:
```yaml
ports:
  - "8001:8000"  # Thay host port thành 8001
```

### Lỗi 3: Backend không kết nối được Database

**Triệu chứng**: `connection refused` hoặc `could not connect to server`

**Giải pháp**:
1. Kiểm tra DB đã chạy chưa:
   ```powershell
   docker compose ps
   ```
   Phải thấy `defense-db` có status `Up (healthy)`

2. Nếu DB chưa healthy, đợi 30s rồi thử lại

3. Nếu vẫn lỗi, restart:
   ```powershell
   docker compose down
   docker compose up --build
   ```

### Lỗi 4: AI không hoạt động

**Triệu chứng**: Response từ AI là "No providers available" hoặc tương tự

**Giải pháp**:
1. Kiểm tra API key đã nhập đúng chưa trong file `.env`
2. Kiểm tra key còn hoạt động không:
   ```powershell
   # Test Google API key
   curl http://localhost:8000/health
   
   # xem "ai_ready" có phải true không
   ```
3. Nếu `ai_ready: false`, kiểm tra lại key trong `.env` → restart:
   ```powershell
   docker compose restart api
   ```

### Lỗi 5: FE không gọi được BE (CORS Error)

**Triệu chứng**: Mở Console (F12) thấy lỗi CORS

**Giải pháp**:
- localhost thường không bị CORS, nếu bị kiểm tra `main.py` có `allow_origins=["*"]` không

### Lỗi 6: Frontend build lỗi

**Triệu chứng**: `npm run build` fail

**Giải pháp**:
```powershell
# Xóa node_modules và rebuild
cd apps\web
Remove-Item -Recurse node_modules
Remove-Item package-lock.json
npm install
npm run build
```

Hoặc rebuild qua Docker:
```powershell
docker compose down
docker compose up --build web
```

### Lỗi 7: Database đã có data cũ, muốn reset

**Triệu pháp**:
```powershell
# Dừng và xóa TOÀN BỘ data
docker compose down -v

# Chạy lại (database sẽ trống)
docker compose up --build

# Chạy lại migration
docker compose exec api alembic upgrade head
```

### Lỗi 8: Không có Python trên máy

**Triệu chứng**: `python: command not found`

**Giải pháp**:
1. Tải Python: https://www.python.org/downloads/
2. Khi cài, **tích checkbox** "Add Python to PATH"
3. Verify:
   ```powershell
   python --version
   ```

---

## Cấu trúc thư mục sau deploy

```
DefendAI/
├── docker-compose.yml       # Quản lý tất cả services
├── .env                     # Biến môi trường (KHÔNG commit lên git)
├── apps/
│   ├── api/
│   │   ├── Dockerfile       # Image cho Backend
│   │   ├── requirements.txt # Python dependencies
│   │   ├── app/
│   │   │   ├── main.py      # Entry point
│   │   │   ├── core/config.py
│   │   │   ├── routers/
│   │   │   ├── services/
│   │   │   └── models/
│   │   └── migrations/      # Alembic migrations
│   └── web/
│       ├── Dockerfile       # Image cho Frontend
│       ├── package.json     # Node dependencies
│       └── src/
│           └── app/         # Next.js app directory
└── DEPLOY/
    ├── DEPLOY_GUIDE.md           # Hướng dẫn deploy lên cloud
    └── DEPLOY_LOCAL_WINDOWS.md   # Hướng dẫn deploy lên máy cá nhân
```

---

## Chi phí

| Service | Chi phí |
|---------|---------|
| Docker Desktop | $0 (Personal use) |
| PostgreSQL | $0 (trong Docker) |
| Backend | $0 (chạy local) |
| Frontend | $0 (chạy local) |
| **Tổng** | **$0** |

---

## Tóm tắt các lệnh nhanh

```powershell
# Clone
git clone https://github.com/DamThanQuy/DefendAI.git
cd DefendAI

# Cấu hình
Copy-Item .env.example .env
notepad .env   # Nhập API keys

# Khởi chạy
docker compose up --build

# Tạo DB schema (lần đầu)
docker compose exec api alembic upgrade head

# Dừng
docker compose down

# Reset data
docker compose down -v
```
