# Task cho Dev C — Sprint Demo (14/6 → 21/6)

**Vai trò:** Fullstack — Feature Owner: Question Generation API + DB/Config

---

## ĐÃ XONG (Tuần trước)

- [x] DB schema (9 tables: User, Document, Meeting, etc.)
- [x] Alembic migrations
- [x] Database config (database.py)

---

## Ngày 1 (14/6): Schemas + Prompt Engineering

- [ ] Tạo `app/schemas/document.py` — DocumentResponse, UploadResponse
- [ ] Tạo 3 system prompts cho Persona (inline trong service hoặc file riêng):
  - **Persona 1 - Lý thuyết:** Giảng viên hàn lâm, bắt lỗi lý thuyết, phương pháp luận
  - **Persona 2 - Thực tế:** Chuyên gia doanh nghiệp, hỏi ứng dụng thực tế
  - **Persona 3 - Khắt khe:** Hội đồng khó tính, bắt bẻ logic, số liệu
- [ ] Prompt yêu cầu AI trả về JSON array: `[{question, hint, difficulty}]`

---

## Ngày 2 (15/6): Question Generation API

- [ ] Tạo `app/routers/questions.py`:
  - `POST /api/questions/generate` — nhận `{document_id, persona}` → gọi AI → trả 10 câu hỏi
  - `GET /api/questions/{assessment_id}` — lấy kết quả đã generate
- [ ] Tạo `app/services/question_generator.py`:
  - Nhận document_id + persona
  - Query Document từ DB → gọi document_parser.extract_text()
  - Chunk text → gọi AI Gateway với prompt persona
  - Parse JSON response → lưu vào assessments table
  - Trả về danh sách câu hỏi
- [ ] Tạo `app/schemas/question.py` — QuestionGenerateRequest, QuestionResponse
- [ ] Register router vào `main.py`
- [ ] Test: upload PDF → generate questions → verify 10 câu hỏi trả về

---

## Ngày 3 (16/6): Support Code Review + Frontend

- [ ] Hỗ trợ Dev A test Code Review API
- [ ] Kết nối trang `/code-review` với API (nếu Dev A bận)
- [ ] Fix bugs từ integration testing

---

## Ngày 4 (17/6): Error Handling + Validation

- [ ] Thêm validation cho tất cả API (file type, document_id tồn tại, etc.)
- [ ] Thêm error handling: AI timeout, parse error, file corrupt
- [ ] Uniform error response format: `{detail: "message"}`

---

## Ngày 5-7: Mock Room + Report + Polish

- [ ] Đơn giản hóa Mock Room — chat UI với AI (gọi AI Gateway trực tiếp, không WebSocket)
- [ ] Tạo `services/report_generator.py` — tổng hợp assessment results
- [ ] Verify tất cả API endpoints hoạt động
- [ ] Chuẩn bị seed data demo
- [ ] Final commit + push

---

## Files tạo/sửa

| File | Trạng thái |
|------|-----------|
| `apps/api/app/routers/questions.py` | 🆕 Tạo mới |
| `apps/api/app/services/question_generator.py` | 🆕 Tạo mới |
| `apps/api/app/schemas/question.py` | 🆕 Tạo mới |
| `apps/api/app/schemas/document.py` | 🆕 Tạo mới |
| `apps/api/app/services/report_generator.py` | 🆕 Tạo mới |
| `apps/api/app/main.py` | ✏️ Đăng ký router |
