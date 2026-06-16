# Sprint Week 2 — 21/6 → 28/6

## Mục tiêu

Hoàn thiện prototype — tất cả feature chính hoạt động end-to-end, sẵn sàng demo.

---

## Flow Demo

```
User mở localhost:3000 (FE)
         ↓
Upload file PDF/DOCX → POST /api/documents/upload (BE)
  → Validate → Lưu file lên disk → Lưu metadata vào DB
         ↓
Chọn Persona → POST /api/questions/generate (BE)
  → Parse file → chunk → AI generate 10 câu hỏi + gợi ý → lưu DB
         ↓
Hiện 10 câu hỏi + gợi ý (FE)
         ↓
Upload file .zip → POST /api/code/scan (BE)
  → Parse source code → AI phân tích → lưu DB
         ↓
Hiện kết quả code review (FE)
```

> **Week sau**: Report + Mock Room + Polish

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
- [x] Parse nội dung file (PDF/DOCX) → extract text → chunk → lưu vào DB
- [x] Hoàn thiện `services/question_generator.py` — parse + chunk + AI generate + lưu DB
- [x] Hoàn thiện `routers/questions.py` — POST /api/questions/generate + GET /api/questions/{id}
- [x] Hoàn thiện `schemas/question.py` — request/response models
- [x] Register router trong `main.py`
- [ ] ~~Kết nối FE `/questions` với real API~~ (chưa làm, để sprint sau)
- [ ] ~~Hiển thị 10 câu hỏi + gợi ý theo persona~~ (chưa làm)
- _Code xong. Cần test:_

#### Cần test Giai đoạn 2
- [ ] Test import: `from app.services.question_generator import generate_questions` — không lỗi
- [ ] Test import: `from app.routers.questions import router` — không lỗi
- [ ] Test persona validation — persona không tồn tại → 400
- [ ] Test document not found — document_id không tồn tại → 400
- [ ] Test ZIP rejection — upload .zip rồi gọi generate → 400
- [ ] Test generate với document thật (PDF) + persona "mentor" → 200 + có 10 questions
- [ ] Test cached assessment — gọi lại cùng document + persona → trả kết quả cũ (không generate lại)
- [ ] Test GET /api/questions/{id} — assessment tồn tại → 200
- [ ] Test GET /api/questions/{id} — assessment không tồn tại → 404
- [ ] Test AI error handling — mock AI gateway fail → assessment status = "failed"

### Giai đoạn 3: Code Review — End-to-end
- [ ] Hoàn thiện `routers/code_review.py` + `services/code_reviewer.py`
- [ ] Kết nối FE `/code-review` với real API
- [ ] Hiển thị issues + suggestions
- _Ai làm:_

---

## Checklist Acceptance (Week 2 — Prototype)

```
✅ Upload PDF/DOCX → lưu file + DB (validation đầy đủ)
✅ Generate Questions → 10 câu hỏi + gợi ý theo persona
✅ Upload .zip → lưu source code
✅ Scan Code → issues + suggestions
```

## TODO Week sau (sprint tiếp)

- [ ] Report generation — tổng hợp kết quả
- [ ] Mock Room — chat UI với AI
- [ ] Polish + Integration (E2E test, UI fix, responsive)
- [ ] Demo chạy mượt 3 lần không crash
