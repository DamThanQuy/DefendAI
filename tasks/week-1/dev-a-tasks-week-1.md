# Task cho Dev A — Sprint Demo (14/6 → 21/6)

**Vai trò:** Fullstack — Feature Owner: Code Review API + Frontend Integration

---

## ĐÃ XONG (Tuần trước)

- [x] Frontend Next.js setup (7 trang, UI components, Tailwind)
- [x] UploadZone component
- [x] Mock pages: /questions, /code-review, /room, /report

---

## Ngày 1 (14/6): Connect Frontend ↔ Backend

- [ ] Tạo `apps/web/src/lib/api.ts` — Axios instance trỏ `http://localhost:8000`
- [ ] Kết nối UploadZone với `POST /api/documents/upload`
- [ ] Thêm loading state + error toast khi upload
- [ ] Hiển thị document_id sau khi upload thành công

---

## Ngày 2 (15/6): Questions Page → Real API

- [ ] Kết nối trang `/questions` với API:
  - Nhận document_id từ upload
  - Gọi `POST /api/questions/generate` với persona
  - Hiển thị 10 câu hỏi thật theo tab (Lý thuyết / Thực tế / Khắt khe)
- [ ] Component Accordion cho hint ẩn/hiện
- [ ] Badge độ khó cho mỗi câu hỏi

---

## Ngày 3 (16/6): Code Review API (Backend)

- [ ] Tạo `apps/api/app/routers/code_review.py`:
  - `POST /api/code/scan` — nhận `document_id` → gọi code_parser → gọi AI → trả issues JSON
- [ ] Tạo `apps/api/app/services/code_reviewer.py`:
  - Nhận code_text → gọi AI với prompt code review → parse JSON response
- [ ] Tạo `apps/api/app/schemas/code_review.py`
- [ ] Register router vào `main.py`
- [ ] Test với curl

---

## Ngày 4 (17/6): Code Review Page → Real API

- [ ] Kết nối trang `/code-review` với API thật
- [ ] Hiển thị issues theo severity (error/warning/info)
- [ ] Hiển thị file:line bằng font monospace
- [ ] Hiển thị suggestions

---

## Ngày 5-7: Polish + Fix

- [ ] Fix UI bugs, responsive
- [ ] Loading states cho tất cả trang
- [ ] Kết nối trang `/room` + `/report` (mock hoặc API thật)
- [ ] Seed data, đảm bảo UI đẹp khi demo
- [ ] Final commit + push

---

## Files tạo/sửa

| File | Trạng thái |
|------|-----------|
| `apps/web/src/lib/api.ts` | 🆕 Tạo mới |
| `apps/web/src/components/features/assessment/UploadZone.tsx` | ✏️ Kết nối API |
| `apps/web/src/app/questions/page.tsx` | ✏️ Real API |
| `apps/web/src/app/code-review/page.tsx` | ✏️ Real API |
| `apps/api/app/routers/code_review.py` | 🆕 Tạo mới |
| `apps/api/app/services/code_reviewer.py` | 🆕 Tạo mới |
| `apps/api/app/schemas/code_review.py` | 🆕 Tạo mới |
| `apps/api/app/main.py` | ✏️ Đăng ký router |
