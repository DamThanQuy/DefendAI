# DefendAI - Báo cáo Deploy

> **Cập nhật**: 2026-06-22
> **Server**: Intel Xeon E3-1245 V2, 6GB RAM, **Windows 10 Pro**
> **Docker Desktop**: v4.78.0 (Engine running, WSL2)

---

## 1. Tổng quan môi trường

| Thành phần | Giá trị |
| ---------- | ------- |
| OS | Windows 10 Pro |
| CPU | Intel Xeon E3-1245 V2 |
| RAM | 6 GB |
| Disk | 1006.85 GB used (Docker Desktop WSL: 1.47 GB) |
| Docker Desktop | v4.78.0, Engine running |
| Project path | `d:\STUDY\KY7\EXE101\DefendAI` |
| GitHub repo | `DamThanQuy/DefendAI` |
| RAM Docker hiện | 0.78 GB / CPU 0.00% |
| Docker Compose | `docker-compose.yml` (api, web, db) — không dùng (FE/DB đã cloud) |

---

## 2. Kiến trúc hiện tại

```
┌──────────────────┐         ┌────────────────────────┐         ┌──────────────────┐
│  FE (Vercel)     │         │  Máy Windows Local     │         │  DB (Supabase)   │
│  Next.js 14      │  HTTPS  │  ┌──────────────────┐  │  port   │  PostgreSQL      │
│  defend-ai       │────────▶│  │  BE (FastAPI)    │──│─5432───▶│  db.givppsbvxlxni│
│  .vercel.app     │ tunnel  │  │  Docker container│  │         │  ujyqfvf.supabase│
│                  │◀────────│  │  localhost:8000  │  │         │  .co             │
└──────────────────┘         │  └──────────────────┘  │         └──────────────────┘
        ✅                   │          ▲              │              ✅
                             │          │              │
                             │   ngrok/Cloudflare     │
                             │   Tunnel (expose)      │
                             └────────────────────────┘
                                        ⏳
```

| Service | Platform | Trạng thái |
| ------- | -------- | ---------- |
| Frontend | Vercel (cloud) | ✅ Đã deploy |
| Backend | Windows + Docker (local) | ⏳ Cần deploy |
| Database | Supabase (cloud) | ✅ Đã deploy |
| Expose BE | Cloudflare Tunnel / ngrok | ⏳ Cần setup |
| CI/CD | GitHub Actions | ✅ Đang chạy |

---

## 3. Tiến độ triển khai (Checklist)

### ✅ Đã hoàn thành (5/8)

| # | Hạng mục | Chi tiết |
| - | -------- | -------- |
| 1 | **Frontend (FE)** | Đã deploy trên Vercel: `https://defend-ai.vercel.app` |
| 2 | **Database (DB)** | Đã deploy trên Supabase, 9 bảng đã tạo |
| 3 | **Docker Desktop** | v4.78.0, WSL2, Engine running |
| 4 | **Git** | Đã cài trên máy |
| 5 | **GitHub Actions CI** | `.github/workflows/ci.yml` đang pass |

### ⏳ Đang triển khai (3/8) — CẦN LÀM

| # | Hạng mục | Lệnh/Hướng dẫn |
| - | -------- | --------------- |
| 6 | **Backend (BE)** | `docker build -t defendai-api .` + `docker run` (xem [`DEPLOY_GUIDE.md`](./DEPLOY_GUIDE.md) Bước 3) |
| 7 | **Expose BE** | Cloudflare Tunnel hoặc ngrok (xem Bước 4) |
| 8 | **Cập nhật FE env + CORS** | Sửa `NEXT_PUBLIC_API_URL` + `allow_origins` (xem Bước 5) |

### ❌ Không cần / Bỏ qua

| # | Hạng mục | Lý do bỏ |
| - | -------- | -------- |
| - | Vercel deploy FE | Đã làm rồi |
| - | Supabase DB | Đã làm rồi |
| - | Docker Compose full stack | FE/DB không cần local |

---

## 4. Tài liệu hướng dẫn

| File | Mục đích | Trạng thái |
| ---- | -------- | ---------- |
| `DEPLOY_GUIDE.md` | **Hướng dẫn chính** — Deploy BE local | ✅ Cập nhật 2026-06-22 |
| `DEPLOY_LOCAL_WINDOWS.md` | Deploy cả 3 services local (tham khảo) | ℹ️ |
| `DEPLOY_RENDER.md` | Deploy cả hệ thống lên Render (cloud) | ℹ️ |
| `DEPLOY_REPORT.md` | File báo cáo này | ✅ |

---

## 5. Task cần làm tiếp theo

### 🔴 Ưu tiên cao — Deploy Backend

1. **Cấu hình `.env`** cho BE
   ```powershell
   cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
   Copy-Item .env.example .env
   notepad .env
   ```
   Điền:
   - `DATABASE_URL` → lấy từ Supabase Dashboard
   - `GOOGLE_API_KEY` / `NVIDIA_API_KEY` → từ AI Studio / NVIDIA
   - `SECRET_KEY` → `python -c "import secrets; print(secrets.token_hex(32))"`

2. **Build & chạy Docker**
   ```powershell
   docker build -t defendai-api .
   docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api
   ```

3. **Verify**
   ```powershell
   docker ps                                    # defendai-api status "Up"
   curl http://localhost:8000/health            # {"status":"healthy"}
   ```

### 🟡 Ưu tiên trung bình — Expose BE

4. **Cài Cloudflare Tunnel** (khuyến nghị) hoặc **ngrok** (nhanh)
   ```powershell
   winget install Cloudflare.cloudflared
   cloudflared tunnel login
   cloudflared tunnel create defendai
   cloudflared tunnel run defendai
   ```

5. **Copy URL tunnel** (ví dụ: `https://random.trycloudflare.com` hoặc `https://xxx.ngrok-free.app`)

### 🟡 Ưu tiên trung bình — Cập nhật FE

6. **Sửa `NEXT_PUBLIC_API_URL` trên Vercel** → URL tunnel
7. **Sửa `allow_origins`** trong `apps/api/app/main.py` → thêm domain FE + domain tunnel
8. **Rebuild BE container** để áp dụng CORS mới

### 🟢 Ưu tiên thấp (tùy chọn)

9. Mua tên miền cố định cho tunnel (Namecheap/Porkbun ~$1-10/năm)

---

## 6. Lệnh Docker thường dùng (chỉ cho BE)

```powershell
# Build image
docker build -t defendai-api .

# Chạy container
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api

# Xem logs
docker logs -f defendai-api

# Restart (sau khi sửa env)
docker restart defendai-api

# Rebuild sau khi sửa code
git pull
docker build -t defendai-api .
docker rm -f defendai-api
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api

# Xóa container
docker rm -f defendai-api
```

---

## 7. Health check tổng hợp

```powershell
# BE local
curl http://localhost:8000/health

# BE qua tunnel
curl https://<tunnel-url>/health

# Swagger UI
# Browser: http://localhost:8000/docs
#         hoặc https://<tunnel-url>/docs
```

**Kết quả mong đợi:**
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

---

## 8. URL & Ports

| Service | URL | Ghi chú |
| ------- | --- | ------- |
| Frontend | `https://defend-ai.vercel.app` | Cloud (Vercel) |
| Backend (local) | `http://localhost:8000` | Trong máy Windows |
| Backend (tunnel) | `https://<tunnel>.trycloudflare.com` hoặc `https://xxx.ngrok-free.app` | Sau khi setup tunnel |
| Database | `db.givppsbvxlxniujyqfvf.supabase.co:5432` | Cloud (Supabase) |

| Port | Service |
| ---- | ------- |
| 8000 | FastAPI (BE container) — map từ container 8000 → host 8000 |

---

## 9. Chi phí

| Service | Chi phí/tháng |
| ------- | ------------- |
| CI/CD (GitHub Actions) | $0 (2000 mins free) |
| Frontend (Vercel) | $0 (hobby) |
| Backend (Docker local) | $0 (điện nhà) |
| Database (Supabase) | $0 (500MB free) |
| Expose BE (ngrok / Cloudflare) | $0 (free tier) |
| AI API | Free tier |
| **Tổng** | **$0** |

> **Tùy chọn**: Mua tên miền ~1-10$/năm nếu muốn URL cố định.

---

## 10. Lịch sử thay đổi

| Ngày | Cập nhật |
| ---- | -------- |
| 2026-06-22 | Viết lại `DEPLOY_GUIDE.md` — chỉ hướng dẫn deploy BE (FE + DB đã deploy) |
| 2026-06-22 | Cập nhật báo cáo này |
| 2026-06-21 | `DEPLOY_LOCAL_WINDOWS.md` được tạo (Docker Compose full stack) |
| 2026-06-21 | Hướng dẫn Render được tạo |
| (trước đó) | Kiến trúc gốc: Ubuntu VM + ngrok + Vercel + Supabase |

---

## 11. Liên hệ / Tài liệu tham chiếu

- **GitHub repo**: https://github.com/DamThanQuy/DefendAI
- **GitHub Actions**: https://github.com/DamThanQuy/DefendAI/actions
- **Supabase Dashboard**: https://supabase.com/dashboard
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Hướng dẫn chính**: [`DEPLOY_GUIDE.md`](./DEPLOY_GUIDE.md)
- **Hướng dẫn Render**: [`DEPLOY_RENDER.md`](./DEPLOY_RENDER.md)
- **Hướng dẫn Local (tham khảo)**: [`DEPLOY_LOCAL_WINDOWS.md`](./DEPLOY_LOCAL_WINDOWS.md)