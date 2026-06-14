# Sprint Demo — 14/6 → 21/6 (7 ngày)

**Mục tiêu:** Có demo end-to-end: Upload tài liệu → AI sinh câu hỏi + quét code → hiển thị kết quả.

**Deadline:** Chủ nhật 21/6 — presentation demo.

**Phương châm:** 3 thành viên **fullstack** (ai cũng làm cả FE + BE), không chia role riêng. Tập trung vào **đi được flow chính**, bỏ qua Auth/Login, WebSocket, Meeting cho tới sau demo.

---

## Phân công theo Feature (ai nhận feature đó lo từ A-Z)

| Feature | Owner | Deliverable |
|---------|-------|-------------|
| **F1: Upload API + Storage** | **Quý** | `POST /api/documents/upload` hoạt động, file lưu disk + DB |
| **F2: Generate Questions API** | **Dev C** | `POST /api/questions/generate` trả về 10 câu hỏi JSON |
| **F3: Code Review API** | **Dev A** | `POST /api/code/scan` trả về danh sách issues JSON |

> **Lưu ý:** Mỗi người **chịu trách nhiệm chính** feature của mình từ backend → frontend kết nối → test. Tuy nhiên ai cũng có thể fix bug ở bất kỳ đâu nếu cần.

---

## Flow Demo (mục tiêu cuối cùng)

```
1. User mở localhost:3000
2. Upload file tài liệu (PDF/DOCX) → gọi POST /api/documents/upload
3. Chọn Persona → gọi POST /api/questions/generate
4. Hiển thị 10 câu hỏi + gợi ý (tab Persona)
5. Upload file .zip source code → gọi POST /api/documents/upload
6. Gọi POST /api/code/scan
7. Hiển thị kết quả code review (issues + suggestions)
```

---

## Daily Plan

### Ngày 1 (14/6 — Thứ Bảy): Upload API + Connect Frontend
- **Quý:** Tạo `routers/documents.py` — endpoint upload, validate file type/size, lưu disk + DB
- **Dev C:** Tạo `schemas/document.py` + prompt engineering 3 persona cho question generation
- **Dev A:** Kết nối UploadZone frontend với backend API thật, tạo `lib/api.ts`
- **Milestone:** Upload file PDF/DOCX lên → lưu vào `uploads/` folder + DB records

### Ngày 2 (15/6 — Chủ Nhật): Question Generation API
- **Dev C:** Tạo `routers/questions.py` + `services/question_generator.py` — nhận document_id + persona → gọi AI → trả 10 câu hỏi JSON
- **Quý:** Tạo `services/code_parser.py` — unzip .zip, đọc source code, bỏ qua node_modules/.git
- **Dev A:** Kết nối trang `/questions` với API thật, hiển thị câu hỏi theo tab persona
- **Milestone:** Upload PDF → Generate → Hiển thị 10 câu hỏi (FE + BE connected)

### Ngày 3 (16/6 — Thứ Hai): Code Review API
- **Dev A:** Tạo `routers/code_review.py` + `services/code_reviewer.py` — nhận document_id → gọi AI → trả issues JSON
- **Quý:** Tạo prompt engineering Code Review AI + test với file .zip mẫu
- **Dev C:** Kết nối trang `/code-review` với API thật, hiển thị issues
- **Milestone:** Upload .zip → Scan → Hiển thị kết quả code review

### Ngày 4 (17/6 — Thứ Ba): End-to-End Integration
- **Cùng nhau:** Kết nối tất cả routers vào `main.py`, test toàn bộ flow
- **Quý:** Verify document_parser.py hoạt động đúng với upload flow
- **Dev A:** Fix UI bugs, responsive, loading states
- **Dev C:** Thêm error handling, validation cho tất cả API
- **Milestone:** Flow đầy đủ: Upload → Questions → Code Review chạy được trên localhost

### Ngày 5 (18/6 — Thứ Tư): Polish + Mock Room
- **Dev C:** Đơn giản hóa Mock Room (chat UI với AI, không cần WebSocket thật)
- **Quý:** Tạo `services/report_generator.py` — tổng hợp kết quả từ assessments + code_analyses
- **Dev A:** Kết nối trang `/room` + `/report` với mock data hoặc API thật
- **Milestone:** Tất cả 7 trang đều có nội dung thực (không còn placeholder)

### Ngày 6 (19/6 — Thứ Năm): Bug Fix + Demo Prep
- **Cùng nhau:** Test toàn bộ demo flow, fix bugs
- **Quý:** Đảm bảo backend stable, không crash khi upload nhiều file
- **Dev C:** Chuẩn bị file mẫu (PDF, DOCX, .zip) để demo
- **Dev A:** Chuẩn bị seed data, đảm bảo UI đẹp khi demo
- **Milestone:** Demo chạy mượt 3 lần liên tiếp không lỗi

### Ngày 7 (20/6 — Thứ Sáu): Final Polish + Push
- **Cùng nhau:** Final commit + push, deploy lên Vercel (FE) nếu cần
- **Quý:** Viết script demo (step-by-step flow)
- **Dev A:** Đảm bảo responsive trên tablet/laptop
- **Dev C:** Verify tất cả API endpoints đều hoạt động
- **Milestone:** Sẵn sàng demo ngày 21/6

---

## Checklist Demo (Acceptance Criteria)

```
✅ Mở localhost:3000 → thấy trang chủ với UploadZone
✅ Upload file PDF → backend lưu + trả document_id
✅ Click Generate Questions → hiện 10 câu hỏi + gợi ý
✅ Upload file .zip → backend lưu
✅ Click Scan Code → hiện danh sách issues + suggestions
✅ Trang /questions, /code-review, /room, /report đều có nội dung
✅ Không crash khi dùng
```

---

## Files CẦN TẠO MỚI

| File | Owner | Mô tả |
|------|-------|-------|
| `apps/api/app/routers/documents.py` | Quý | Upload API |
| `apps/api/app/schemas/document.py` | Dev C | Pydantic cho documents |
| `apps/api/app/services/code_parser.py` | Quý | Parse .zip source code |
| `apps/api/app/routers/questions.py` | Dev C | Question generation API |
| `apps/api/app/services/question_generator.py` | Dev C | Logic sinh câu hỏi |
| `apps/api/app/routers/code_review.py` | Dev A | Code review API |
| `apps/api/app/services/code_reviewer.py` | Dev A | Logic quét code |
| `apps/api/app/schemas/question.py` | Dev C | Pydantic cho questions |
| `apps/api/app/schemas/code_review.py` | Dev A | Pydantic cho code review |
| `apps/web/src/lib/api.ts` | Dev A | Axios instance kết nối BE |

## Files ĐÃ CÓ (cần sửa/đăng ký)

| File | Cần làm gì |
|------|-----------|
| `apps/api/app/main.py` | Đăng ký thêm 3 routers mới |
| `apps/web/src/components/features/assessment/UploadZone.tsx` | Kết nối với real API |
| `apps/web/src/app/questions/page.tsx` | Replace mock data → real API |
| `apps/web/src/app/code-review/page.tsx` | Replace mock data → real API |
