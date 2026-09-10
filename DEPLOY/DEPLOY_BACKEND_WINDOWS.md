# DefendAI — Hướng dẫn Deploy Backend (không FE) trên máy Windows

> Triển khai **6 service backend** bằng Docker Compose: `api`, `db`, `minio`, `worker`, `worker_multi`, `redis`.
> Frontend (Next.js) chạy **riêng trên máy khác**, trỏ API URL về IP của máy này.

## Tổng quan kiến trúc

```
┌───────────────────── Máy Windows (backend) ─────────────────────┐
│                                                                  │
│  ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌─────────────────┐  │
│  │   api   │──▶│   db    │   │  redis   │◀──│ worker          │  │
│  │ FastAPI │   │ PgSQL16 │   │  queue   │   │ worker_multi x4 │  │
│  │  :8000  │   │ :5433   │   │  :6379   │   │ (process pool)  │  │
│  └────┬────┘   └─────────┘   └──────────┘   └─────────────────┘  │
│       │                                                          │
│  ┌────▼────┐                                                      │
│  │  minio  │  Object storage (file uploads)                       │
│  │ :9000   │  Console UI :9001                                    │
│  └─────────┘                                                      │
└──────────────────────────────────────────────────────────────────┘
         ▲
         │ HTTP (từ máy khác)
┌────────┴────────┐
│ Máy Windows FE  │  Next.js :3000 → NEXT_PUBLIC_API_URL=http://<IP-backend>:8000
└─────────────────┘
```

**Số tiến trình:**

| Service | Container | Tiến trình OS |
|---------|-----------|---------------|
| api | defense-api | 1 (uvicorn; entrypoint tự chạy alembic + seed trước) |
| db | defense-db | 1 (PostgreSQL) |
| redis | defense-redis | 1 |
| minio | defense-minio | 1 |
| worker | defense-worker | 1 (worker_main.py) |
| worker_multi | defense-worker-multi | 5 (1 cha + 4 process con, `WORKER_PROCESSES=4`) |

Tổng: **6 container ≈ 10 tiến trình OS**.

---

## Bước 0: Yêu cầu phần mềm

### 0.1 Docker Desktop (bắt buộc)

1. Tải: https://www.docker.com/products/docker-desktop/
2. Cài đặt → Restart máy (installer yêu cầu bật **WSL2** — chọn WSL2)
3. Mở Docker Desktop → đợi icon system tray ổn định
4. Verify:

```powershell
docker --version
# Docker version 27.x.x+

docker compose version
# Docker Compose version v2.x.x+
```

### 0.2 Git (nếu clone từ GitHub)

```powershell
git --version
```

### 0.3 API Keys

Cần các key sau (đã có sẵn trong `.env` gốc — copy nguyên file sang máy mới):

| Key | Dùng cho | Lấy tại |
|-----|----------|---------|
| `LOCAL_API_KEY` | AI Gateway (agnes) | https://apihub.agnes-ai.com |
| `NVIDIA_EMBED_API_KEY` | Embedding RAG | https://build.nvidia.com/ |
| `GOOGLE_EMBED_API_KEY` | Embedding fallback | https://aistudio.google.com/apikey |

---

## Bước 1: Chuẩn bị source code

**Cách A — Clone từ GitHub:**

```powershell
cd D:\
git clone https://github.com/DamThanQuy/DefendAI.git
cd DefendAI
```

**Cách B — Copy từ máy cũ:**

Copy toàn bộ thư mục `DefendAI` qua USB / mạng LAN. Bỏ qua `node_modules`, `.next`, `__pycache__` (chỉ cần phần backend nhưng copy cả repo cho đơn giản).

---

## Bước 2: Cấu hình `.env`

Copy file `.env` từ máy cũ sang thư mục gốc project (ngang hàng `docker-compose.yml`).

Nếu tạo mới, nội dung tối thiểu:

```env
# Database (Docker internal — KHÔNG sửa)
DATABASE_URL=postgresql://postgres:postgres@db:5432/defense_db

# AI Gateway
LOCAL_API_KEY=<key-agnes>
LOCAL_BASE_URL=https://apihub.agnes-ai.com/v1
LOCAL_MODEL=agnes-2.5-flash
DEFAULT_PROVIDER=localhost

# Embedding (RAG)
GOOGLE_EMBED_API_KEY=<key-google>
GOOGLE_EMBED_BASE_URL=https://generativelanguage.googleapis.com/v1beta/models
GOOGLE_EMBED_MODEL=gemini-3.1-flash-lite
NVIDIA_EMBED_API_KEY=<key-nvidia>
NVIDIA_EMBED_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2
NVIDIA_EMBED_TEXT_MODEL=nvidia/nemotron-3-embed-1b
NVIDIA_EMBED_BASE_URL=https://integrate.api.nvidia.com/v1

# Auth — tạo key mới bằng: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=<random-hex-32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
REFRESH_TOKEN_EXPIRE_DAYS=7

# Google OAuth (nếu dùng login Google)
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>

# MinIO
MINIO_ENDPOINT=http://minio:9000
MINIO_PUBLIC_ENDPOINT=http://<IP-máy-này>:9000
MINIO_ACCESS_KEY_ID=minioadmin
MINIO_SECRET_ACCESS_KEY=minioadmin
MINIO_BUCKET=defend-files
MINIO_REGION=us-east-1
MINIO_SECURE=false
```

> **Quan trọng**: `MINIO_PUBLIC_ENDPOINT` phải là IP/hostname của **máy backend** (FE ở máy khác sẽ tải file qua URL này). Dùng IP LAN, ví dụ `http://192.168.1.50:9000`. Xem IP: `ipconfig` → dòng IPv4.

> **SECRET_KEY**: nếu FE đã cấp token với key cũ thì giữ nguyên key cũ để token không bị vô hiệu.

---

## Bước 3: Khởi chạy backend (6 service)

```powershell
cd D:\DefendAI   # hoặc thư mục chứa docker-compose.yml

# Build + chạy chỉ backend, bỏ service web
docker compose up --build -d db redis minio api worker worker_multi
```

Lần đầu mất 3–5 phút (pull image PostgreSQL, Redis, MinIO + build image API).

`api` container tự động chạy khi start (theo `entrypoint.sh`):
1. `alembic upgrade heads` — tạo schema database
2. `python seed_users.py` — seed user demo
3. `uvicorn app.main:app --host 0.0.0.0 --port 8000`

→ **Không cần chạy migration thủ công**.

### Mở firewall cho máy FE trỏ tới

Chạy PowerShell **Administrator**:

```powershell
New-NetFirewallRule -DisplayName "DefendAI Backend" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000,9000,9001
```

---

## Bước 4: Kiểm tra

### 4.1 Trạng thái container

```powershell
docker compose ps
```

Kết quả mong đợi — 6 container `Up (healthy)`:

```
NAME                  STATUS
defense-api           Up (healthy)
defense-db            Up (healthy)
defense-minio         Up (healthy)
defense-redis         Up (healthy)
defense-worker        Up (healthy)
defense-worker-multi  Up (healthy)
```

> `worker` / `worker_multi` có thể hiện `starting` trong ~10s đầu (start_period).

### 4.2 Health endpoint

```powershell
curl http://localhost:8000/health
```

Mong đợi `"status": "healthy"` và `"ai_ready": true`.

### 4.3 Swagger UI

Mở browser: `http://localhost:8000/docs`

### 4.4 MinIO Console

`http://localhost:9001` — đăng nhập `minioadmin` / `minioadmin`.

### 4.5 Kiểm tra từ máy FE

Trên máy FE, mở `http://<IP-backend>:8000/health`. Nếu không mở được → kiểm tra firewall (Bước 3).

---

## Bước 5: Cấu hình máy FE trỏ về backend này

Trên máy chạy frontend, sửa `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://<IP-backend>:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<client-id>
```

Rồi chạy FE:

```powershell
cd apps\web
npm install
npm run dev
```

---

## Quản lý hệ thống

```powershell
# Khởi động lại (sau khi máy restart / Docker restart)
docker compose up -d db redis minio api worker worker_multi

# Dừng (giữ nguyên data)
docker compose down

# Dừng + xóa toàn bộ data (reset database, minio, redis)
docker compose down -v

# Xem log realtime
docker compose logs -f
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f worker_multi

# Restart 1 service
docker compose restart api

# Rebuild 1 service (sau khi sửa code)
docker compose up --build -d api

# Scale worker_multi (mỗi replica spawn 4 process con)
docker compose up -d --scale worker_multi=2
```

### Port mapping

| Service | Host Port | URL |
|---------|-----------|-----|
| api | 8000 | http://localhost:8000 |
| db | 5433 | localhost:5433 (user/pass: postgres/postgres) |
| redis | 6379 | localhost:6379 |
| minio S3 API | 9000 | http://localhost:9000 |
| minio Console | 9001 | http://localhost:9001 |

### Volume data (persist sau restart)

| Volume | Chứa |
|--------|------|
| defense_postgres_data | Database |
| defense_minio_data | File uploads (nằm `./data/minio` bind mount) |
| defense_redis_data | Queue |
| defense_analysis_tmp | File tạm khi worker phân tích |

---

## Xử lý lỗi phổ biến

### Lỗi 1: Docker không start

`docker: command not found` hoặc Docker Desktop không mở.

1. Mở Docker Desktop
2. Đợi icon system tray ổn định (không loading)
3. Vẫn lỗi → Restart Docker Desktop

### Lỗi 2: Port bị chiếm

`Bind for 0.0.0.0:8000 failed: port is already allocated`

```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

Hoặc đổi host port trong `docker-compose.yml` (vd `"8001:8000"`).

### Lỗi 3: api không kết nối được db

`connection refused` / `could not connect to server`

1. `docker compose ps` — `defense-db` phải `Up (healthy)`
2. Đợi 30s rồi thử lại
3. Vẫn lỗi → `docker compose down` rồi `docker compose up --build -d db redis minio api worker worker_multi`

### Lỗi 4: AI không hoạt động

Response "No providers available" hoặc `/health` báo `ai_ready: false`

1. Kiểm tra `LOCAL_API_KEY` trong `.env`
2. `docker compose restart api worker worker_multi` (env chỉ load khi container start)

### Lỗi 5: worker unhealthy

```powershell
docker compose logs worker
docker compose logs worker_multi
```

Thường do Redis chưa sẵn sàng → restart: `docker compose restart worker worker_multi`.

### Lỗi 6: FE (máy khác) không gọi được API

1. Từ máy FE: `curl http://<IP-backend>:8000/health`
2. Fail → firewall: chạy lại lệnh `New-NetFirewallRule` (Bước 3) với quyền Administrator
3. OK mà FE vẫn lỗi → kiểm tra `NEXT_PUBLIC_API_URL` đúng IP, restart `npm run dev` (biến `NEXT_PUBLIC_*` chỉ đọc lúc build/start)

### Lỗi 7: Reset toàn bộ data

```powershell
docker compose down -v
docker compose up --build -d db redis minio api worker worker_multi
```

(api tự chạy lại migration + seed.)

### Lỗi 8: File upload lỗi / presigned URL sai

`MINIO_PUBLIC_ENDPOINT` trong `.env` phải là IP LAN của máy backend (không phải `localhost`), vì browser ở máy FE tải file trực tiếp từ MinIO qua URL này.

---

## Chạy tự động sau khi Windows khởi động (tùy chọn)

Docker Desktop → Settings → General → tick **"Start Docker Desktop when you sign in"**.

Sau đó tạo task scheduler chạy lệnh up:

```powershell
# PowerShell Administrator — tạo task chạy khi logon
$action = New-ScheduledTaskAction -Execute "powershell" `
  -Argument "-NoProfile -Command cd D:\DefendAI; docker compose up -d db redis minio api worker worker_multi"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "DefendAI Backend" -Action $action -Trigger $trigger -RunLevel Highest
```

---

## Cấu trúc thư mục liên quan

```
DefendAI/
├── docker-compose.yml       # Định nghĩa 7 service (deploy bỏ web)
├── .env                      # Biến môi trường — KHÔNG commit git
├── apps/
│   └── api/
│       ├── Dockerfile        # Image backend (api + worker + worker_multi dùng chung)
│       ├── entrypoint.sh     # alembic → seed → uvicorn
│       ├── worker_main.py    # Worker đơn tiến trình
│       ├── worker_multi.py   # Worker đa tiến trình (WORKER_PROCESSES=4)
│       └── app/              # FastAPI source
└── DEPLOY/
    └── DEPLOY_BACKEND_WINDOWS.md   # File này
```
