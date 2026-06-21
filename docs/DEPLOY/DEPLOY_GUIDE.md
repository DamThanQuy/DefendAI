# DefendAI - Hướng dẫn Deploy

<!-- Cập nhật: BE deploy trên máy cá nhân (Ubuntu VM) + ngrok -->

## Tổng quan kiến trúc

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   Vercel     │─────▶│  Máy cá nhân     │      │   Supabase   │
│  Frontend    │ ngrok│  Ubuntu Server    │      │  PostgreSQL   │
│  Next.js 14  │─────▶│  FastAPI (Docker) │─────▶│              │
│    FREE      │      │    Always On      │      │    FREE      │
└──────────────┘      └──────────────────┘      └──────────────┘
        ▲
        │  auto deploy on push
   ┌────┴─────┐
   │  Vercel  │
   │  CI hook │
   └────┬─────┘
        │
   ┌────┴─────────────┐
   │ GitHub Actions   │
   │   CI Pipeline    │
   │      FREE        │
   └──────────────────┘
```

| Service  | Platform                | Ghi chú                             |
| -------- | ----------------------- | ----------------------------------- |
| CI/CD    | GitHub Actions          | 2000 mins/tháng free                |
| Frontend | Vercel                  | Unlimited hobby projects            |
| Backend  | Máy cá nhân (Ubuntu VM) | Always On, không cold start         |
| Expose   | ngrok                   | Free tier, URL thay đổi mỗi restart |
| Database | Supabase                | 500MB PostgreSQL free               |

### Tại sao deploy BE trên máy cá nhân?

- **Không cold start**: Server luôn chạy, không sleep như Render Free
- **RAM/CPU tùy ý**: Không bị giới hạn 512 MB như Render Free
- **Không tốn phí**: Miễn là máy tính của bạn luôn bật khi demo
- **Phù hợp đồ án**: Đủ ổn định cho bảo vệ và demo

***

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

***

## Bước 0.5: Kết nối SSH giữa các máy (nếu cần)

Nếu bạn muốn kết nối Trae IDE từ máy này sang máy khác qua SSH, thực hiện các bước sau:

### Yêu cầu trên máy remote (máy chủ)

**1. Cài đặt & khởi động SSH Server**

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install openssh-server
sudo systemctl enable ssh
sudo systemctl start ssh

# CentOS/RHEL
sudo yum install openssh-server
sudo systemctl enable sshd
sudo systemctl start sshd
```

**2. Kiểm tra SSH Server đang chạy**
```bash
sudo systemctl status ssh
```
→ Nếu thấy **"active (running)"** là OK.

**3. Mở Firewall (nếu có)**
```bash
# UFW
sudo ufw allow ssh

# hoặc firewall-cmd
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

**4. Lấy IP của máy remote**
```bash
hostname -I
```
→ Ghi lại IP đó (ví dụ: `192.168.1.50`).

**5. Tạo tài khoản SSH (nếu chưa có)**
```bash
sudo adduser tenuser
sudo usermod -aG sudo tenuser
```

### Kết nối từ máy local

```bash
ssh tenuser@IP-cua-may-remote
```

Ví dụ:
```bash
ssh TKMX3@192.168.88.229
```

### Nếu hai máy ở hai mạng khác nhau

Nếu hai máy không cùng mạng LAN, cần dùng thêm công cụ để kết nối qua internet:

**Giải pháp 1: Tailscale (khuyến nghị - miễn phí)**
```bash
# Trên cả 2 máy
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Đăng nhập cùng tài khoản trên cả 2 máy
# Sau đó kết nối bằng IP Tailscale
ssh TKMX3@<IP-tailscale-cua-may-remote>
```

**Giải pháp 2: ngrok (nhanh, tạm thời)**
```bash
# Trên máy remote
ngrok tcp 22
# Copy URL ngrok (ví dụ: tcp://0.tcp.ngrok.io:12345)

# Trên máy local
ssh TKMX3@0.tcp.ngrok.io -p 12345
```

**Giải pháp 3: Port Forwarding trên Router**
- Đăng nhập vào router máy remote
- Forward port 22 → IP nội bộ của máy remote
- Dùng IP公网 của router để kết nối

### Verify kết nối

Sau khi kết nối thành công, kiểm tra:
```bash
# Trên máy remote
curl http://localhost:8000/health
# Trả về {"status":"healthy"} là OK
```

***

## Bước 1: CI/CD với GitHub Actions (Free) ✅ HOÀN THÀNH

> **Status: ĐÃ HOÀN THÀNH** — CI pipeline đang chạy, tất cả jobs pass.
> Repo: <https://github.com/DamThanQuy/DefendAI/actions>
> Run gần nhất: `CI - Build & Test #4` — ✅ success

CI/CD đảm bảo code mới được kiểm tra trước khi deploy, tránh break production. **Nên setup trước** để các bước deploy sau có auto deploy.

### 1.1 Cách hoạt động

```
git push to master
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
│  └─ Cả 2 job trên pass → Deploy FE     │
└─────────────────────────────────────────┘
       │
       ▼
Vercel (FE) auto deploy
Ubuntu VM (BE) → git pull → rebuild Docker thủ công
```

### 1.2 File CI/CD

File đã tạo sẵn: `.github/workflows/ci.yml`

Nội dung chính:

| Job             | Kiểm tra                                | Cần thiết                    |
| --------------- | --------------------------------------- | ---------------------------- |
| **Backend**     | Ruff lint, test, Docker build           | PostgreSQL service container |
| **Frontend**    | ESLint, TypeScript check, Next.js build | Node.js 20                   |
| **Deploy Gate** | Cả 2 job pass mới deploy                | Chạy trên push to main       |

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

***

## Bước 2: Tạo Database trên Supabase (Free)

### 2.1 Tạo project

1. Vào <https://supabase.com> → Sign in with GitHub
2. Click **"New Project"**
3. Cài đặt:
   - **Organization**: Chọn hoặc tạo mới
   - **Project name**: `defendai-db`
   - **Database password**: Nhập password mạnh (ghi nhớ!)
   - **Region**: `Southeast Asia (Singapore)` — gần VN nhất
4. Click **Create new project** → chờ \~2 phút

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

***

## Checklist: Những gì cần chuẩn bị trước khi chạy

Trước khi bắt đầu deploy, đảm bảo đã có đầy đủ các thành phần sau:

| # | Thành phần                  | Trạng thái | Ghi chú                                                                                 |
| - | --------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| 1 | **Code repository**         | ☐          | Đã có source code tại máy                                                               |
| 2 | **Python 3.10 - 3.12**      | ✅         | Đã có trên máy |
| 3 | **Git**                     | ☐          | Cài tại <https://git-scm.com/download/win>                                              |
| 4 | **File** **`.env`** **BE**  | ☐          | Điền `apps/api/.env` theo ví dụ trong Bước 3                                            |
| 5 | **Supabase Database**       | ☐          | Đã tạo project + lấy Connection String                                                  |
| 6 | **API Keys**                | ☐          | Google AI key, NVIDIA key                                                               |
| 7 | **ngrok**                   | ☐          | Cài tại <https://ngrok.com/download> nếu cần expose BE ra internet                      |
| 8 | **Node.js 18+**             | ☐          | Dùng cho xây dựng lại frontend nếu cần                                                  |
| 9 | **FE đã deploy lên Vercel** | ☐          | Có URL để kết nối sau này                                                               |

***

## Bước 3: Setup Backend trên máy cá nhân

Có 2 cách:

- **Option A (Khuyến nghị để test nhanh)**: Docker Desktop trên Windows
- **Option B**: Ubuntu Server trên VMware

> **Bạn đang thử Option A** — Docker Desktop trên Windows.

***

### Option A: Chạy Backend bằng Docker Desktop trên Windows

#### 3A.1 Cài Docker Desktop

1. Download Docker Desktop: <https://www.docker.com/products/docker-desktop/>
2. Cài đặt → mở Docker Desktop
3. Đăng nhập hoặc bỏ qua
4. Đảm bảo Docker đang chạy: mở PowerShell và chạy:

```powershell
docker --version
```

Nếu hiện version là OK.

#### 3A.2 Clone & cấu hình Backend

Mở PowerShell:

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
cp .env.example .env
notepad .env
```

Sửa `.env`:

```env
# Database (Supabase hoặc PostgreSQL local)
DATABASE_URL=postgresql+asyncpg://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# AI API Keys
GOOGLE_API_KEY=your-google-api-key
NVIDIA_API_KEY=your-nvidia-api-key
DEFAULT_PROVIDER=google
ORCHESTRATOR_PROVIDER=nvidia

# Auth
SECRET_KEY=your-random-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

#### 3A.3 Build & chạy Docker

```powershell
docker build -t defendai-api .
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api
```

Kiểm tra:

```powershell
docker ps
curl http://localhost:8000/health
```

→ Trả về `{"status":"healthy"}` là OK.

#### 3A.4 Lệnh quản lý

```powershell
# Xem logs
docker logs -f defendai-api

# Dừng server
docker stop defendai-api

# Khởi động lại
docker start defendai-api

# Xóa container
docker rm defendai-api
```

#### 3A.5 Khi code thay đổi

```powershell
cd d:\STUDY\KY7\EXE101\DefendAI\apps\api
git pull
docker build -t defendai-api .
docker stop defendai-api
docker rm defendai-api
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api
```

***

### Option B: Chạy Backend bằng Ubuntu Server trên VMware

> Dùng nếu Docker Desktop trên Windows chạy lỗi hoặc thiếu RAM.

#### 3B.1 Cài Ubuntu Server trên VMware

1. Download Ubuntu Server 24.04 LTS: <https://ubuntu.com/download/server>
2. Tạo VM trên VMware:
   - **RAM**: 4 GB (tối thiểu 2 GB)
   - **Disk**: 40 GB
   - **Network**: NAT
3. Cài Ubuntu, đặt:
   - **Server name**: `defendai-server`
   - **Username**: `defendai`
4. Khi hỏi **Install OpenSSH server** → chọn Yes

#### 3B.2 Cài Docker & Docker Compose trên Ubuntu

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt install docker-compose -y
exit
```

Sau khi login lại:

```bash
docker --version
docker-compose --version
```

#### 3B.3 Clone & chạy Backend

```bash
git clone https://github.com/DamThanQuy/DefendAI.git
cd DefendAI/apps/api
cp .env.example .env
nano .env
```

#### 3B.4 Build & chạy Docker

```bash
docker build -t defendai-api .
docker run -d \
  --name defendai-api \
  --restart unless-stopped \
  -p 8000:8000 \
  --env-file .env \
  defendai-api
```

Kiểm tra:

```bash
curl http://localhost:8000/health
```

***

## Bước 4: Expose BE ra Internet bằng ngrok

### 4.1 Tại sao cần ngrok?

FE trên Vercel (internet) cần gọi BE trên máy cá nhân (local). ngrok tạo tunnel:

```
FE (Vercel) ──internet──▶ ngrok ──tunnel──▶ BE (localhost:8000)
```

### 4.2 Cài ngrok trên Windows

1. Vào <https://ngrok.com> → Sign up (free)
2. Download ngrok cho Windows
3. Mở PowerShell trong thư mục chứa ngrok.exe

### 4.3 Đăng ký & cấu hình

```powershell
# Đăng nhập (lấy auth token từ dashboard ngrok)
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### 4.4 Chạy ngrok tunnel

```powershell
ngrok http http://localhost:8000
```

Output:

```
Forwarding  https://xxxx-xxx-xxx.ngrok-free.app → http://localhost:8000
```

**Copy URL này** (VD: `https://xxxx-xxx-xxx.ngrok-free.app`) — FE sẽ gọi URL này.

### 4.5 Lưu ý

- **Free tier**: URL thay đổi mỗi lần restart ngrok
- **Để URL cố định hơn**: Tạo domain trên dashboard ngrok, rồi chạy:
  ```powershell
  ngrok http --domain=your-name.ngrok-free.app http://localhost:8000
  ```
- **Khi bảo vệ/demo**: Chạy ngrok trước, copy URL mới nhất vào Vercel env

***

## Bước 5: Cập nhật Frontend trỏ đến Backend

### 5.1 Cập nhật env trên Vercel

1. Vercel Dashboard → Project `defend-ai` → **Settings** → **Environment Variables**
2. Sửa `NEXT_PUBLIC_API_URL`:

```
NEXT_PUBLIC_API_URL = https://xxxx-xxx-xxx.ngrok-free.app
```

1. **Save** → Vercel tự redeploy

### 5.2 Cập nhật CORS trên Backend

Sửa file `apps/api/app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://defend-ai.vercel.app",
        "https://xxxx-xxx-xxx.ngrok-free.app",
        "http://localhost:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

```bash
git add apps/api/app/main.py
git commit -m "fix: update CORS for ngrok"
git push origin master
```

→ CI chạy → Vercel tự rebuild.

### 5.3 Cập nhật lại khi ngrok restart

Mỗi lần restart ngrok sẽ cấp URL mới. Cần:

1. Copy URL mới từ ngrok terminal
2. Cập nhật `NEXT_PUBLIC_API_URL` trên Vercel
3. Cập nhật `allow_origins` trong `main.py` → push lại

***

## Bước 6: Verify toàn bộ

### Checklist

| # | Kiểm tra        | Cách                              | Kết quả                |
| - | --------------- | --------------------------------- | ---------------------- |
| 1 | BE health       | Browser: `{ngrok-url}/health`     | `{"status":"healthy"}` |
| 2 | BE docs         | Browser: `{ngrok-url}/docs`       | Swagger UI hiển thị    |
| 3 | FE trang chủ    | Browser: Vercel URL               | Trang chủ hiển thị     |
| 4 | FE gọi BE       | F12 Console trên FE               | Không có CORS error    |
| 5 | Upload tài liệu | Thử upload file PDF               | Thành công             |
| 6 | Supabase DB     | Supabase Dashboard → Table Editor | Có data                |

### Test flow

1. Mở frontend → Đăng ký tài khoản
2. Đăng nhập
3. Upload tài liệu
4. Generate câu hỏi
5. Scan code

***

## Troubleshooting

### CI fail

- Vào GitHub → Actions → click vào workflow fail → xem step nào lỗi
- **Backend lint fail**: Chạy `ruff check app/` local để fix
- **Frontend lint fail**: Chạy `npm run lint` local để fix
- **Build fail**: Kiểm tra dependency thiếu hoặc lỗi syntax

### BE không start được trên Ubuntu

```bash
# Xem logs để biết lỗi gì
docker logs defendai-api

# Thường gặp:
# - Thiếu env variable → kiểm tra file .env
# - DATABASE_URL sai → test connection trước
# - Port 8000 bị chiếm → docker ps xem có container cũ không
```

### FE không gọi được BE (CORS Error)

1. Kiểm tra ngrok đang chạy: mở terminal ngrok, đảm bảo chưa tắt
2. Kiểm tra `allow_origins` trong `main.py` đã có domain ngrok chưa
3. Kiểm tra `NEXT_PUBLIC_API_URL` trên Vercel đã đúng URL ngrok chưa
4. Sau khi sửa → push code → CI pass → Vercel tự rebuild

### ngrok URL thay đổi khi restart

- Free tier mỗi lần restart sẽ cấp URL mới
- Cần cập nhật lại trên Vercel env + CORS trong `main.py`
- **Giải pháp**: Tạo domain cố định trên dashboard ngrok

### Supabase connection timeout

- Dùng port **6543** (Transaction mode) cho Docker/VM
- Nếu không được, thử port **5432** (Session mode)

### Vercel deploy 404 Not Found (Monorepo)

> **Đã gặp & đã fix** — Lỗi thường gặp khi FE nằm trong subfolder của monorepo.

**Fix**:

1. Vercel Dashboard → **Settings** → **Build and Deployment** → **Root Directory**
2. Điền: `apps/web`
3. **Save** → Redeploy

### Docker container tự tắt

```bash
# Kiểm tra tại sao tắt
docker inspect defendai-api --format='{{.State.ExitCode}}'

# Nếu OOM (exit code 137): RAM không đủ
# Nếu exit code 1: Lỗi code → xem logs

# Restart lại
docker start defendai-api
```

***

## Workflow khi phát triển (Sau khi setup xong)

```bash
# 1. Code trên máy Windows (IDE)
# ...

# 2. Push lên GitHub
git push origin master

# 3. CI tự chạy → pass → Vercel tự rebuild FE

# 4. Update BE trên Ubuntu VM
cd ~/DefendAI
git pull
cd apps/api
docker build -t defendai-api .
docker stop defendai-api && docker rm defendai-api
docker run -d --name defendai-api --restart unless-stopped -p 8000:8000 --env-file .env defendai-api

# 5. Restart ngrok nếu cần
# Copy URL mới → update Vercel env
```

### Tóm tắt flow deploy

| Component      | Auto deploy? | Cần làm gì?                             |
| -------------- | ------------ | --------------------------------------- |
| FE (Vercel)    | ✅ Tự động    | Push code → CI pass → Vercel rebuild    |
| BE (Ubuntu VM) | ❌ Thủ công   | `git pull` → rebuild Docker trên VM     |
| ngrok          | ❌ Thủ công   | Restart khi cần, update URL trên Vercel |

***

## Chi phí tổng kết

| Service  | Platform                | Chi phí/tháng             |
| -------- | ----------------------- | ------------------------- |
| CI/CD    | GitHub Actions          | $0 (2000 mins/tháng free) |
| Frontend | Vercel                  | $0                        |
| Backend  | Máy cá nhân (Ubuntu VM) | $0                        |
| Expose   | ngrok                   | $0 (free tier)            |
| Database | Supabase                | $0                        |
| AI API   | Google/NVIDIA           | Free tier                 |
| **Tổng** | <br />                  | **$0**                    |

***

## Cấu trúc env summary

### Supabase

```
DATABASE_URL=postgresql+asyncpg://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

### Backend (.env trên Ubuntu VM)

```
DATABASE_URL=postgresql+asyncpg://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
GOOGLE_API_KEY=<your key>
NVIDIA_API_KEY=<your key>
DEFAULT_PROVIDER=google
ORCHESTRATOR_PROVIDER=nvidia
SECRET_KEY=<random hex>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

### Vercel (Frontend env vars)

```
NEXT_PUBLIC_API_URL=https://xxxx-xxx-xxx.ngrok-free.app
```

