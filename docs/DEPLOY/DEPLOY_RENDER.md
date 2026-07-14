# DefendAI - Deploy bằng Render (Free)

<!-- Cập nhật: 2026-06-21 — Chuyển từ self-host sang Render -->

## Tổng quan kiến trúc mới

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Vercel     │─────▶│     Render       │      │   Supabase   │
│  Frontend    │      │  FastAPI (Free)  │─────▶│  PostgreSQL   │
│  Next.js 14  │      │  Public URL      │      │    FREE      │
│    FREE      │      │  Cold start ⚠️   │      │              │
└──────────────┘      └──────────────────┘      └──────────────┘
        ▲
        │  auto deploy on push
   ┌────┴─────┐
   │  Vercel  │
   │  CI hook │
   └──────────┘
```

### So sánh cũ vs mới

| | Cũ (Self-host + ngrok) | Mới (Render Free) |
|---|---|---|
| **BE hosting** | Máy cá nhân luôn bật | Render cloud ☁️ |
| **Expose** | ngrok (URL thay đổi) | Render URL cố định ✅ |
| **Cold start** | Không có | Có (~30s sau 15 phút idle) |
| **Chi phí** | $0 | $0 |
| **Complexity** | Docker + ngrok + CORS update | Push code là xong ✅ |

> **Cold start**: Sau 15 phút không có request, Render sẽ sleep service. Khi có request mới, mất ~30s để wake up. **Đủ ổn cho demo/bảo vệ** — chỉ cần mở trang 1 lần là server chạy mượt.

***

## Bước 1: Tạo tài khoản Render

1. Vào <https://render.com> → **Get Started for Free**
2. Sign up with **GitHub** (dùng cùng account với repo DefendAI)
3. Verify email nếu cần

***

## Bước 2: Deploy Backend lên Render

### 2.1 Tạo Web Service

1. Render Dashboard → **New** → **Web Service**
2. Connect GitHub repo:
   - Chọn account **DamThanQuy**
   - Chọn repo **DefendAI**
3. Cài đặt:

| Field | Giá trị |
|-------|---------|
| **Name** | `defendai-api` |
| **Region** | `Singapore` (sgp1) — gần VN nhất |
| **Branch** | `master` |
| **Runtime** | `Python 3` |
| **Build Command** | `cd apps/api && pip install -r requirements.txt` |
| **Start Command** | `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` |

> **Lưu ý**: Render tự gán biến `PORT`, không cần hardcode port 8000.

### 2.2 Thêm Environment Variables

Trong phần **Environment** của Web Service, thêm các biến:

```
DATABASE_URL = postgresql+asyncpg://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
GOOGLE_API_KEY = your-google-api-key
NVIDIA_API_KEY = your-nvidia-api-key
DEFAULT_PROVIDER = google
ORCHESTRATOR_PROVIDER = nvidia
SECRET_KEY = your-random-secret-key
ALGORITHM = HS256
ACCESS_TOKEN_EXPIRE_MINUTES = 30
```

> Copy từ file `apps/api/.env` trên máy, paste vào Render.

### 2.3 Deploy

1. Click **Create Web Service**
2. Render tự build & deploy (~2-3 phút)
3. Khi xong, sẽ có URL: `https://defendai-api.onrender.com`

### 2.4 Verify

Mở browser:
```
https://defendai-api.onrender.com/health
```
→ Trả về `{"status":"healthy", ...}` là OK ✅

Swagger docs:
```
https://defendai-api.onrender.com/docs
```

***

## Bước 3: Cập nhật Frontend trỏ đến Render

### 3.1 Cập nhật env trên Vercel

1. Vercel Dashboard → Project `defend-ai` → **Settings** → **Environment Variables**
2. Sửa `NEXT_PUBLIC_API_URL`:

```
NEXT_PUBLIC_API_URL = https://defendai-api.onrender.com
```

3. **Save** → Vercel tự redeploy

### 3.2 CORS đã OK sẵn

File `main.py` hiện tại đang dùng `allow_origins=["*"]` → **không cần sửa gì thêm**. Render URL đã được chấp nhận.

***

## Bước 4: Verify toàn bộ

| # | Kiểm tra | Cách | Kết quả |
|---|---------|------|---------|
| 1 | BE health | Browser: `https://defendai-api.onrender.com/health` | `{"status":"healthy"}` |
| 2 | BE docs | Browser: `https://defendai-api.onrender.com/docs` | Swagger UI |
| 3 | FE trang chủ | Browser: Vercel URL | Trang chủ hiển thị |
| 4 | FE gọi BE | F12 Console trên FE | Không có CORS error |
| 5 | Upload tài liệu | Thử upload file PDF | Thành công |

***

## Quản lý trên Render

### Dashboard
- <https://dashboard.render.com> → chọn service `defendai-api`

### Các thao tác phổ biến

| Thao tác | Cách |
|----------|------|
| **Xem logs** | Dashboard → Logs tab |
| **Manual deploy** | Dashboard → Manual Deploy → Deploy latest commit |
| **Restart** | Dashboard → Restart service |
| **Xem env vars** | Dashboard → Environment tab |
| **Pause service** | Dashboard → Settings → Pause |

### Khi code thay đổi

```bash
# Push code lên GitHub
git add .
git commit -m "feat: update something"
git push origin master

# Render TỰ ĐỘNG deploy lại (nếu bật Auto Deploy)
# Hoặc vào Dashboard → Manual Deploy
```

***

## Xử lý sự cố

### Cold start quá lâu (~30s)

- **Nguyên nhân**: Render Free sleep sau 15 phút idle
- **Giải pháp**: 
  - Dùng UptimeRobot (free) ping mỗi 5 phút để giữ service awake
  - Hoặc chấp nhận cold start khi demo (mở trang trước 30s)

### Build fail trên Render

```bash
# Kiểm tra log trên Dashboard → Logs
# Thường gặp:
# - Thiếu dependency → kiểm tra requirements.txt
# - Python version sai → kiểm tra runtime setting
# - Path sai → đảm bảo build/start command đúng
```

### BE không start được

- Vào **Logs** tab trên Render Dashboard
- Kiểm tra có thiếu env variable không
- Kiểm tra `DATABASE_URL` có đúng không

### Supabase connection timeout

- Render Free chạy ở Singapore → kết nối Supabase Singapore OK
- Nếu timeout, thử port **5432** thay vì **6543**

***

## Chi phí tổng kết

| Service | Platform | Chi phí/tháng |
|---------|----------|---------------|
| CI/CD | GitHub Actions | $0 |
| Frontend | Vercel | $0 |
| Backend | Render (Free) | $0 |
| Database | Supabase | $0 |
| AI API | Google/NVIDIA | Free tier |
| **Tổng** | | **$0** |

***

## Workflow khi phát triển

```bash
# 1. Code trên IDE
# ...

# 2. Push lên GitHub
git push origin master

# 3. CI tự chạy → pass
# 4. Render TỰ ĐỘNG deploy BE
# 5. Vercel TỰ ĐỘNG deploy FE

# Done! Không cần làm gì thêm 🎉
```

### Tóm tắt flow deploy mới

| Component | Auto deploy? | Cần làm gì? |
|-----------|-------------|-------------|
| FE (Vercel) | ✅ Tự động | Push code → CI pass → Vercel rebuild |
| BE (Render) | ✅ Tự động | Push code → Render rebuild |
| DB (Supabase) | — | Không thay đổi |

> **So với cũ**: Bỏ Docker thủ công + ngrok. Chỉ cần `git push` là xong! 🚀
