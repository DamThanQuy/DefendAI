# DefendAI - Hướng dẫn Deploy Backend

<!-- Cập nhật: 2026-06-22 — File này chỉ hướng dẫn deploy BE -->

> **🎯 File này chỉ hướng dẫn deploy BACKEND (FastAPI)**
>
> | Thành phần | Trạng thái | Platform |
> | ---------- | ---------- | -------- |
> | **Frontend (FE)** | ✅ Đã deploy sẵn | Vercel |
> | **Database (DB)** | ✅ Đã deploy sẵn | Supabase |
> | **Backend (BE)** | ⏳ CẦN DEPLOY | **Local Windows + Docker** ← file này hướng dẫn |
>
> **Tài liệu liên quan:**
> - [`DEPLOY_RENDER.md`](./DEPLOY_RENDER.md) — Deploy cả hệ thống lên Render (cloud, free)
> - [`DEPLOY_LOCAL_WINDOWS.md`](./DEPLOY_LOCAL_WINDOWS.md) — Deploy cả 3 services local (tham khảo)

***

## Tổng quan kiến trúc

```
┌──────────────────┐         ┌────────────────────────┐         ┌──────────────────┐
│  FE (Vercel)     │         │  Máy Windows Local     │         │  DB (Supabase)   │
│  Next.js 14      │  HTTPS  │  ┌──────────────────┐  │  port   │  PostgreSQL      │
│                  │────────▶│  │  BE (FastAPI)    │──│─5432───▶│                  │
│  defend-ai       │ tunnel  │  │  Docker container│  │         │  db.givppsbvxlxni│
│  .vercel.app     │◀────────│  │  localhost:8000  │  │         │  ujyqfvf.supabase│
│                  │         │  └──────────────────┘  │         │  .co             │
└──────────────────┘         │          ▲              │         └──────────────────┘
                             │          │              │
                             │   ngrok/Cloudflare     │
                             │   Tunnel (expose)      │
                             └────────────────────────┘
```

| Service | Platform | Trạng thái |
| ------- | -------- | ---------- |
| **Frontend** | Vercel (cloud, free) | ✅ Đã deploy |
| **Backend** | Windows + Docker (local) | ⏳ Cần deploy |
| **Database** | Supabase (cloud, free) | ✅ Đã deploy |
| **Expose BE** | Cloudflare Tunnel / ngrok | ⏳ Cần setup |
| **CI/CD** | GitHub Actions (free) | ✅ Đang chạy |

### Tại sao deploy BE trên máy local?

- **Không cold start**: Server chạy liên tục, không sleep như Render Free
- **RAM/CPU tùy ý**: Không giới hạn 512 MB như Render Free
- **Không tốn phí**: Miễn là máy bạn luôn bật
- **Phù hợp đồ án**: Đủ ổn định cho demo/bảo vệ

***

## Bước 0: Chuẩn bị — Xác nhận FE và DB đã deploy

> File này **CHỈ** hướng dẫn deploy BE. Giả định FE và DB đã chạy ổn định.

### 0.1 Kiểm tra FE đã deploy trên Vercel

1. Vào https://vercel.com/dashboard → Project `defend-ai`
2. Kiểm tra URL: `https://defend-ai.vercel.app` (hoặc domain tùy chỉnh)
3. Mở browser → đăng ký/đăng nhập thử → nếu lỗi kết nối tới API → chưa có BE → cần làm tiếp

### 0.2 Kiểm tra DB đã deploy trên Supabase

1. Vào https://supabase.com/dashboard → Project `defendai-db`
2. **Table Editor** → kiểm tra có **9 bảng** (`users`, `documents`, `questions`, `code_scans`, `assessments`, ...)
3. **Settings** → **Database** → **Connection string** → tab **URI**:
   ```
   postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```
   → URL này sẽ dùng cho BE trong `.env`

### 0.3 Lấy API Keys (Google AI / NVIDIA)

- **Google AI Studio**: https://aistudio.google.com/apikey (60 req/phút free)
- **NVIDIA NIM**: https://build.nvidia.com/ (free credits)

> **Lưu ý**: Cần ít nhất 1 trong 2 key để AI hoạt động.

***

## Bước 1: Cài Docker Desktop trên Windows

> Yêu cầu: Windows 10 Pro+, RAM >= 4GB (server hiện tại 6GB)

1. Download: https://www.docker.com/products/docker-desktop/
2. Cài đặt → **Restart máy** nếu được yêu cầu
3. Mở Docker Desktop → đợi icon Docker ở system tray chuyển **đông** (không loading)
4. Verify:

```powershell
docker --version
# Docker version 27.x.x+

docker compose version
# Docker Compose version v2.x.x+
```

> **Lưu ý**: Docker Desktop yêu cầu **WSL2**. Installer sẽ tự bật nếu chưa có.

***

## Bước 2: Cấu hình Backend

### 2.1 Vào thư mục API

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
```

### 2.2 Tạo file `.env` từ template

```powershell
Copy-Item .env.example .env
notepad .env
```

### 2.3 Điền các giá trị

```env
# ====== Database (Supabase — ĐÃ DEPLOY SẴN) ======
DATABASE_URL=postgresql+asyncpg://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# ====== AI API Keys (lấy từ Bước 0.3) ======
GOOGLE_API_KEY=your-google-api-key-here
NVIDIA_API_KEY=your-nvidia-api-key-here

# ====== Routing ======
DEFAULT_PROVIDER=google
ORCHESTRATOR_PROVIDER=nvidia

# ====== Auth ======
# Tạo SECRET_KEY ngẫu nhiên:
#   python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=paste-random-key-vào-đây
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

> **Quan trọng**:
> - `DATABASE_URL` → lấy từ Supabase Dashboard (Bước 0.2)
> - Dùng port **6543** (Transaction mode)
> - `[YOUR-PASSWORD]` → thay bằng password thật của Supabase
> - Phải có ít nhất 1 trong 2 AI key

### 2.4 Verify kết nối DB (không bắt buộc nhưng nên làm)

```powershell
$env:DATABASE_URL="postgresql+asyncpg://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"
python -c "import asyncio, asyncpg; asyncio.run(asyncpg.connect('$env:DATABASE_URL'.replace('postgresql+asyncpg://', 'postgresql://')))"
# Không lỗi = OK
```

***

## Bước 3: Tạo Docker image cho Backend

> File `Dockerfile` đã có sẵn ở `apps/api/Dockerfile`.

### 3.1 Build image

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
docker build -t defendai-api .
```

Quá trình build mất ~2-5 phút (cài Python deps).

### 3.2 Chạy container

```powershell
docker run -d `
  --name defendai-api `
  --restart unless-stopped `
  -p 8000:8000 `
  --env-file .env `
  defendai-api
```

**Giải thích các flag:**

| Flag | Ý nghĩa |
|------|---------|
| `-d` | Chạy nền (detached) |
| `--name defendai-api` | Tên container |
| `--restart unless-stopped` | Tự khởi động lại khi reboot |
| `-p 8000:8000` | Map port host 8000 -> container 8000 |
| `--env-file .env` | Load biến môi trường từ file `.env` |

### 3.3 Verify

```powershell
# Xem container đang chạy
docker ps
# -> Có defendai-api, status "Up"

# Health check
curl http://localhost:8000/health
# -> {"status":"healthy","ai_providers":["google","nvidia"],"ai_ready":true,...}

# Swagger UI
# Mở browser: http://localhost:8000/docs
```

✅ **BE đã chạy thành công trên localhost:8000!**

### 3.4 Lệnh quản lý container

```powershell
# Xem logs realtime
docker logs -f defendai-api

# Dừng
docker stop defendai-api

# Khởi động lại
docker start defendai-api

# Restart (sau khi sửa env)
docker restart defendai-api

# Xóa container
docker rm -f defendai-api

# Xem resource usage
docker stats defendai-api
```

### 3.5 Khi code thay đổi

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
git pull

# Rebuild image
docker build -t defendai-api .

# Xóa container cũ + chạy container mới
docker rm -f defendai-api
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api
```

***

## Bước 4: Expose Backend ra Internet

> FE trên Vercel (cloud) cần gọi BE trên máy local của bạn → cần **tunnel**.

### 4.1 Tại sao cần tunnel?

```
FE (Vercel, internet) ──HTTPS──▶ ??? ──▶ BE (localhost:8000)
                                  ↑
                            Cần tunnel
```

### 4.2 Chọn phương pháp

| | Cloudflare Tunnel | ngrok |
|---|---|---|
| **Giá** | Free | Free |
| **URL** | Ổn định hơn (có thể mua domain) | Thay đổi mỗi lần restart (free tier) |
| **Tốc độ** | Nhanh | Trung bình |
| **Cài đặt** | `winget install Cloudflare.cloudflared` | Download .exe từ ngrok.com |

### 4.3 Phương án A: Cloudflare Tunnel (khuyến nghị)

```powershell
# 1. Cài cloudflared
winget install Cloudflare.cloudflared

# 2. Đăng nhập Cloudflare (mở browser)
cloudflared tunnel login

# 3. Tạo tunnel
cloudflared tunnel create defendai

# 4. Chạy tunnel (URL miễn phí *.trycloudflare.com)
cloudflared tunnel --url http://localhost:8000
```

Cloudflare sẽ cấp URL dạng: `https://random-name.trycloudflare.com`

**Copy URL này** — sẽ dùng cho Bước 5.

**Nếu có tên miền trên Cloudflare**, cấu hình `config.yml`:

```yaml
tunnel: defendai
credentials-file: C:\Users\QUYDAM\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: api.defendai.example.com
    service: http://localhost:8000
  - service: http_status:404
```

Sau đó:
```powershell
cloudflared tunnel route dns defendai api.defendai.example.com
cloudflared tunnel run defendai
```

### 4.4 Phương án B: ngrok (nhanh, tạm thời)

```powershell
# 1. Đăng ký tài khoản tại https://ngrok.com
# 2. Download ngrok.exe cho Windows
# 3. Mở PowerShell trong thư mục chứa ngrok.exe

# 4. Authenticate
ngrok config add-authtoken YOUR_AUTH_TOKEN

# 5. Chạy tunnel
ngrok http http://localhost:8000
```

Output:
```
Forwarding  https://xxxx-xxx-xxx.ngrok-free.app -> http://localhost:8000
```

**Copy URL này** — sẽ dùng cho Bước 5.

### 4.5 So sánh & khuyến nghị

- **Demo trong vài giờ**: dùng ngrok (nhanh)
- **Demo lâu dài / bảo vệ**: dùng Cloudflare Tunnel + mua tên miền (~1-10$/năm)
- **Bảo vệ quan trọng**: Tạo tên miền cố định, ví dụ `api.defendai.your-domain.com`

***

## Bước 5: Cập nhật Frontend trỏ về Backend

> FE trên Vercel cần biết URL của BE để gọi API.

### 5.1 Cập nhật biến môi trường trên Vercel

1. Vào https://vercel.com/dashboard → Project `defend-ai`
2. **Settings** → **Environment Variables**
3. Sửa `NEXT_PUBLIC_API_URL`:

```
NEXT_PUBLIC_API_URL = https://xxxx-xxx-xxx.ngrok-free.app
```

> (Hoặc URL Cloudflare: `https://api.defendai.example.com`)

4. **Save** → Vercel tự redeploy (~1-2 phút)

### 5.2 Cập nhật CORS trên Backend

Sửa file `apps/api/app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://defend-ai.vercel.app",         # FE trên Vercel
        "https://xxxx-xxx-xxx.ngrok-free.app",  # ngrok URL
        "https://api.defendai.example.com",     # Cloudflare URL (nếu có)
        "http://localhost:3000",                # dev local
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Sau đó rebuild container:

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
docker build -t defendai-api .
docker rm -f defendai-api
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api
```

> **Mẹo**: Với `allow_origins=["*"]` thì không cần lo CORS (chỉ dùng cho dev).

### 5.3 Cập nhật lại khi URL tunnel thay đổi

Nếu dùng ngrok free tier, mỗi lần restart sẽ có URL mới:

1. Restart ngrok → copy URL mới
2. Vào Vercel → cập nhật `NEXT_PUBLIC_API_URL` → Save (auto redeploy)
3. Sửa `allow_origins` trong `main.py` → rebuild container

**Hoặc dùng ngrok domain cố định:**

```powershell
# Tạo domain miễn phí trên dashboard ngrok (1 lần)
ngrok http --domain=your-fixed-name.ngrok-free.app http://localhost:8000
```

***

## Bước 6: Verify toàn bộ

### Checklist

| # | Kiểm tra | Cách | Kết quả |
| - | -------- | ---- | ------- |
| 1 | Docker Engine | Docker Desktop system tray | "Engine running" |
| 2 | Container BE | `docker ps` | `defendai-api` status `Up` |
| 3 | BE health local | `curl http://localhost:8000/health` | `{"status":"healthy"}` |
| 4 | BE qua tunnel | Browser: `{tunnel-url}/health` | `{"status":"healthy"}` |
| 5 | BE Swagger | Browser: `{tunnel-url}/docs` | Swagger UI hiển thị |
| 6 | FE → BE | F12 Console trên Vercel URL | Không có CORS error |
| 7 | Login flow | Đăng ký + đăng nhập trên FE | Thành công |
| 8 | DB có data | Upload tài liệu → check Supabase Table Editor | Có row mới |

### Test flow

1. Mở FE trên Vercel → đăng ký tài khoản
2. Đăng nhập
3. Upload tài liệu (PDF/DOCX)
4. Generate câu hỏi
5. Scan code
6. Vào Supabase → kiểm tra data được lưu

***

## Troubleshooting

### BE không start được (container crash ngay)

```powershell
# Xem logs để biết lỗi gì
docker logs defendai-api

# Lỗi thường gặp:
# 1. Thiếu env variable → kiểm tra file .env
# 2. DATABASE_URL sai → test connection (Bước 2.4)
# 3. GOOGLE_API_KEY / NVIDIA_API_KEY sai → kiểm tra lại
# 4. SECRET_KEY chưa tạo → chạy lệnh tạo key
```

### BE không kết nối được Supabase

```powershell
# Lỗi: "connection refused" / "could not connect to server"

# 1. Kiểm tra DATABASE_URL đúng port 6543 (không phải 5432)
# 2. Password đúng (không có ký tự đặc biệt chưa escape)
# 3. Supabase project đang "Active" (không pause)
# 4. Nếu dùng IPv6, có thể cần thêm ?sslmode=require
```

### FE không gọi được BE (CORS Error)

1. Kiểm tra tunnel đang chạy (ngrok/cloudflared terminal chưa tắt)
2. Vercel `NEXT_PUBLIC_API_URL` đã đúng URL tunnel chưa
3. `allow_origins` trong `main.py` đã có domain FE + domain tunnel chưa
4. Sau khi sửa → rebuild container:
   ```powershell
   docker rm -f defendai-api
   docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api
   ```

### AI không hoạt động

```powershell
# Kiểm tra health endpoint
curl http://localhost:8000/health

# Nếu "ai_ready": false → API key sai hoặc hết quota
# Google: https://aistudio.google.com/apikey (check quota)
# NVIDIA: https://build.nvidia.com/ (check credits)

# Restart container sau khi sửa .env
docker restart defendai-api
```

### Tunnel URL thay đổi khi restart

- **ngrok free tier**: URL đổi mỗi lần restart
- **Giải pháp**:
  - Tạo ngrok domain cố định (free, 1 lần)
  - Hoặc chuyển sang Cloudflare Tunnel (ổn định hơn)
  - Sau mỗi lần đổi URL → update Vercel env + CORS + rebuild container

### Docker container tự tắt (OOM)

```powershell
# Kiểm tra exit code
docker inspect defendai-api --format='{{.State.ExitCode}}'
# 137 = OOM (RAM không đủ)

# Giải pháp:
# 1. Đóng app khác để giải phóng RAM
# 2. Tăng RAM trong Docker Desktop → Settings → Resources
# 3. Restart container
docker start defendai-api
```

***

## Workflow khi phát triển

```powershell
# 1. Code trên máy Windows (VS Code / Trae IDE)

# 2. Sửa code BE xong → rebuild image
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
git pull
docker build -t defendai-api .
docker rm -f defendai-api
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api

# 3. Sửa code FE xong → push lên GitHub → Vercel tự rebuild
cd d:\STUDY\KY7\EXE101\DefendAI\apps\web
git add .
git commit -m "feat: ..."
git push origin main
# → Vercel auto-detect và redeploy (~1-2 phút)

# 4. CI tự chạy lint/test/build → GitHub Actions
```

### Tóm tắt flow deploy

| Component | Auto deploy? | Cần làm gì? |
| --------- | ------------ | ----------- |
| FE (Vercel) | ✅ Tự động | Push code → Vercel auto-rebuild |
| DB (Supabase) | ✅ Cloud managed | Không cần làm gì |
| **BE (Docker local)** | ❌ Thủ công | `docker build` + `docker run` |
| **Tunnel (ngrok/CF)** | ❌ Thủ công | Restart khi cần, update Vercel env |
| CI (GitHub Actions) | ✅ Tự động | Push code → CI pass |

***

## Chi phí tổng kết

| Service | Platform | Chi phí/tháng |
| ------- | -------- | ------------- |
| CI/CD | GitHub Actions | $0 (2000 mins/tháng free) |
| Frontend | Vercel | $0 (hobby) |
| Backend | Máy local (Docker) | $0 (điện nhà) |
| Database | Supabase | $0 (500MB free) |
| Expose BE | ngrok / Cloudflare Tunnel | $0 (free tier) |
| AI API | Google AI / NVIDIA | Free tier |
| **Tổng** | | **$0** |

> **Lưu ý**: Nếu mua tên miền cho Cloudflare Tunnel, thêm ~1-10$/năm.

***

## Cấu trúc env summary

### Backend (`apps/api/.env`) — CẦN ĐIỀN

```env
# Database (Supabase - đã deploy)
DATABASE_URL=postgresql+asyncpg://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# AI API Keys
GOOGLE_API_KEY=<your key>
NVIDIA_API_KEY=<your key>

# Routing
DEFAULT_PROVIDER=google
ORCHESTRATOR_PROVIDER=nvidia

# Auth
SECRET_KEY=<random hex 64 chars>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### Frontend (Vercel env vars) — CẦN ĐIỀN

```
NEXT_PUBLIC_API_URL=https://xxxx-xxx-xxx.ngrok-free.app
```

### Backend CORS (`apps/api/app/main.py`) — CẦN SỬA

```python
allow_origins=[
    "https://defend-ai.vercel.app",
    "https://xxxx-xxx-xxx.ngrok-free.app",   # hoặc Cloudflare URL
    "http://localhost:3000",                  # dev
]
```

***

## Liên hệ / Tham khảo

- **GitHub repo**: https://github.com/DamThanQuy/DefendAI
- **GitHub Actions**: https://github.com/DamThanQuy/DefendAI/actions
- **Supabase Dashboard**: https://supabase.com/dashboard
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Cloudflare Tunnel**: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
- **ngrok**: https://ngrok.com