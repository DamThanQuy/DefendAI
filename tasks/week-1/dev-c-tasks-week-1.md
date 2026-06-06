# 📋 Task cho Dev C — Tuần 1: Backend/DB

**Vai trò:** Fullstack Integration

---

## Ngày 1-2: Setup Database + Schema

- [ ] Setup PostgreSQL hoặc MongoDB
- [ ] Thiết kế schema **Users**:
  - id, name, email, password_hash, role (admin/member), created_at
- [ ] Thiết kế schema **Documents**:
  - id, user_id (FK), filename, file_path, file_type, file_size, uploaded_at, status (pending/processing/done)
- [ ] Thiết kế schema **Sessions** (chuẩn bị cho tuần 2):
  - id, name, status, created_by, created_at
- [ ] Tạo file `app/models/user.py`, `document.py`, `session.py`
- [ ] Setup Alembic để migration

**File chính:**
- `app/models/` — SQLAlchemy models
- `app/core/database.py` — Kết nối DB
- `app/core/config.py` — Config (phối hợp với Quý)

---

## Ngày 3-4: API Auth + API Upload

- [ ] **API Auth**:
  - [ ] `POST /api/auth/register` — Đăng ký
  - [ ] `POST /api/auth/login` — Đăng nhập, trả về JWT token
  - [ ] `GET /api/auth/me` — Lấy thông tin user hiện tại
  - [ ] Middleware verify JWT token
- [ ] **API Upload**:
  - [ ] `POST /api/documents/upload` — Upload file, lưu vào disk + DB
  - [ ] `GET /api/documents/{id}` — Lấy thông tin file
  - [ ] `GET /api/documents` — List files của user
  - [ ] Validate: chỉ chấp nhận .pdf, .docx, .pptx, max 50MB

**File chính:**
- `app/routers/auth.py` — Auth endpoints
- `app/routers/documents.py` — Document endpoints
- `app/schemas/auth.py`, `document.py` — Pydantic models
- `app/core/security.py` — JWT helper

---

## Ngày 5-6: WebSocket Setup

- [ ] Setup WebSocket server (FastAPI native)
- [ ] Tạo `ws://localhost:8000/ws` — kết nối cơ bản
- [ ] Xử lý events: connect, disconnect, ping/pong
- [ ] Chuẩn bị sẵn event types cho tuần 2:
  - `session:join`, `session:leave`
  - `timer:start`, `timer:stop`, `timer:tick`
  - `phase:change`
  - `role:assign`

**File chính:**
- `app/routers/ws.py` — WebSocket handler

---

## Ngày 7: Deploy + Integration

- [ ] Deploy API + DB lên dev environment
- [ ] Docker compose chạy được cả 3 services (web, api, db)
- [ ] Test toàn bộ API với Postman collection
- [ ] Hỗ trợ Dev A + B test end-to-end
- [ ] Viết Postman collection, export thành file

---

## Files cần tạo/chỉnh sửa

| File | Trạng thái | Ghi chú |
|------|-----------|---------|
| `app/core/database.py` | 🆕 Tạo mới | Kết nối DB |
| `app/core/security.py` | 🆕 Tạo mới | JWT, hash password |
| `app/models/__init__.py` | 🆕 Tạo mới | Base + all models |
| `app/models/user.py` | 🆕 Tạo mới | User model |
| `app/models/document.py` | 🆕 Tạo mới | Document model |
| `app/models/session.py` | 🆕 Tạo mới | Session model (chuẩn bị) |
| `app/routers/auth.py` | 🆕 Tạo mới | Auth endpoints |
| `app/routers/documents.py` | 🆕 Tạo mới | Upload endpoints |
| `app/routers/ws.py` | 🆕 Tạo mới | WebSocket |
| `app/schemas/auth.py` | 🆕 Tạo mới | Pydantic cho auth |
| `app/schemas/document.py` | 🆕 Tạo mới | Pydantic cho document |
| `app/main.py` | ✏️ Sửa | Register routers |