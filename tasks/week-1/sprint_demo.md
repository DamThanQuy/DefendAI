# Sprint Demo — 14/6 → 21/6

**Deadline:** 21/6 (Chủ nhật)
**Phương châm:** 3 thành viên **Fullstack** — ai cũng code cả FE + BE. Không phân role riêng.

## Flow Demo (Mục tiêu)

```
1. Mở localhost:3000 → thấy trang chủ
2. Upload PDF/DOCX → POST /api/documents/upload → lưu file + DB
3. Chọn Persona → POST /api/questions/generate → 10 câu hỏi + gợi ý
4. Upload .zip source code → POST /api/code/scan → danh sách issues
5. Xem Mock Room (chat với AI)
6. Xem Report (tổng hợp kết quả)
```

## Phân công Feature (Mỗi người lo từ A-Z)

| Feature | Owner | Backend | Frontend |
|---------|-------|---------|----------|
| **F1: Upload** | **Quý** | `routers/documents.py` | UploadZone → API |
| **F2: Questions** | **Dev C** | `routers/questions.py` + `question_generator.py` | /questions page |
| **F3: Code Review** | **Dev A** | `routers/code_review.py` + `code_reviewer.py` | /code-review page |

> Ai cũng phải làm cả backend + frontend cho feature của mình.

## Timeline Chi Tiết

| Ngày | Quý | Dev C | Dev A |
|------|-----|-------|-------|
| **14/6** (T7) | Upload API (routers/documents.py) | Schemas + 3 Persona prompts | lib/api.ts + UploadZone → API |
| **15/6** (CN) | Code Parser (services/code_parser.py) | Question Generator API | /questions page → real API |
| **16/6** (T2) | Prompt Code Review | Support test + fix bugs | Code Review API (backend) |
| **17/6** (T3) | Verify upload flow | Error handling + validation | /code-review page → real API |
| **18/6** (T4) | Backend stable + test | Mock Room (chat AI) | /room + /report → API |
| **19/6** (T5) | File mẫu demo | Seed data | Fix UI bugs, responsive |
| **20/6** (T6) | Script demo | Verify all endpoints | Final UI polish |
| **21/6** (CN) | **DEMO** | **DEMO** | **DEMO** |

## Checklist Demo

```
✅ Upload PDF → lưu file + DB
✅ Generate Questions → 10 câu hỏi + gợi ý theo persona
✅ Upload .zip → lưu source code
✅ Scan Code → issues + suggestions
✅ /questions, /code-review, /room, /report đều có nội dung
✅ Không crash
```

## Files Cần Tạo Mới

| File | Owner | Mô tả |
|------|-------|-------|
| `routers/documents.py` | Quý | Upload API |
| `services/code_parser.py` | Quý | Parse .zip |
| `routers/questions.py` | Dev C | Question generation |
| `services/question_generator.py` | Dev C | Logic sinh câu hỏi |
| `routers/code_review.py` | Dev A | Code review API |
| `services/code_reviewer.py` | Dev A | Logic quét code |
| `schemas/document.py` | Dev C | Pydantic cho document |
| `schemas/question.py` | Dev C | Pydantic cho questions |
| `schemas/code_review.py` | Dev A | Pydantic cho code review |
| `lib/api.ts` | Dev A | Axios instance FE |

## Files Đã Có (cần sửa)

| File | Cần gì |
|------|--------|
| `main.py` | Đăng ký 3 routers mới |
| `UploadZone.tsx` | Kết nối upload API |
| `questions/page.tsx` | Replace mock → real API |
| `code-review/page.tsx` | Replace mock → real API |
| `room/page.tsx` | Chat UI với AI |
| `report/page.tsx` | Tổng hợp kết quả |
