# Sprint Week 2 — 21/6 → 28/6

## Mục tiêu

Hoàn thiện prototype — tất cả feature chính hoạt động end-to-end, sẵn sàng demo.

---

## Flow Demo

```
User mở localhost:3000 (FE)
         ↓
Upload file PDF/DOCX → POST /api/documents/upload (BE)
         ↓
Chọn Persona → POST /api/questions/generate (BE)
         ↓
Hiện 10 câu hỏi + gợi ý (FE)
         ↓
Upload file .zip → POST /api/code/scan (BE)
         ↓
Hiện kết quả code review (FE)
```

---

## Week 1 Recap

- [x] FastAPI backend setup + CORS + health check
- [x] AI Gateway multi-provider
- [x] Document parser service (PDF/DOCX/PPTX)
- [x] DB schema 9 tables + Alembic migrations
- [x] Frontend Next.js 7 trang + UI components
- [x] Docker Compose (api + db + web)
- [x] Upload API basic flow hoạt động
- [x] API Documentation (split by group)

## Hôm nay (16/6) đã làm

- [x] Tách entities.py → document.py, user.py, meeting.py, assessment.py (backward compat)
- [x] Fix DB schema mismatch — thêm cột file_type, content_hash vào Document model
- [x] Rebuild Docker container (chuyển Dockerfile sang python:3.12-slim)
- [x] Verify upload API hoạt động end-to-end: file lưu disk + data lưu DB
- [x] Cập nhật `.env` DATABASE_URL cho local development
- [x] Setup venv local (pip install dependencies)

---

## Các giai đoạn cần hoàn thành

### Giai đoạn 1: Upload API — Fix edge cases
- [x] Empty file check (0 bytes → 400)
- [x] Path sanitization (`_sanitize_filename` + `os.path.basename`)
- [x] File name truncation (stem ≤ 200 ký tự, giữ extension)
- [x] Magic bytes validation (`_validate_magic_bytes`)
- [x] Concurrent upload handling (UUID prefix tránh trùng tên)
- [x] Test tất cả edge cases trong `docs/api/01-documents.md` (20/20 passed)
- _Ai làm: Quý_

### Giai đoạn 2: Question Generation — End-to-end
- [ ] Hoàn thiện `routers/questions.py` + `services/question_generator.py`
- [ ] Kết nối FE `/questions` với real API
- [ ] Hiển thị 10 câu hỏi + gợi ý theo persona
- _Ai làm:_

### Giai đoạn 3: Code Review — End-to-end
- [ ] Hoàn thiện `routers/code_review.py` + `services/code_reviewer.py`
- [ ] Kết nối FE `/code-review` với real API
- [ ] Hiển thị issues + suggestions
- _Ai làm:_

### Giai đoạn 4: Report + Mock Room
- [ ] Report generation — tổng hợp kết quả
- [ ] Mock Room — chat UI với AI
- [ ] Kết nối FE `/room` + `/report`
- _Ai làm:_

### Giai đoạn 5: Polish + Integration
- [ ] Test toàn bộ flow end-to-end theo Flow Demo
- [ ] Fix UI bugs + responsive
- [ ] Error handling toàn diện
- [ ] Demo chạy mượt 3 lần không crash
- _Ai làm:_

---

## Checklist Acceptance

```
✅ Upload PDF/DOCX → lưu file + DB (validation đầy đủ)
✅ Generate Questions → 10 câu hỏi + gợi ý theo persona
✅ Upload .zip → lưu source code
✅ Scan Code → issues + suggestions
✅ Mock Room → chat với AI
✅ Report → tổng hợp kết quả
✅ Tất cả 7 trang đều có nội dung thực
✅ Không crash
✅ Responsive
```
