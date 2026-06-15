# Tiến độ Sprint Demo — 14/6 → 21/6

## Tổng quan

| Feature | Owner | Trạng thái |
|---------|-------|-----------|
| Upload API + Storage | Quý | ⏳ Chưa bắt đầu |
| Question Generation API | Dev C | ⏳ Chưa bắt đầu |
| Code Review API | Dev A | ⏳ Chưa bắt đầu |
| Frontend Integration | Dev A | ⏳ Chưa bắt đầu |

## ĐÃ HOÀN THÀNH (Tuần trước)

- [x] FastAPI backend setup + CORS + health check
- [x] AI Gateway multi-provider (NVIDIA Step-3.7-Flash + Google Gemma 4 31B IT)
- [x] 6 AI test endpoints hoạt động
- [x] Document parser service (PDF/DOCX/PPTX)
- [x] DB schema 9 tables + Alembic migrations
- [x] Frontend Next.js 7 trang (Home, Login, Register, Questions, Code Review, Room, Report)
- [x] UI components (Button, Input, Label, Card)
- [x] Push lên `feature/quy/week-1-foundation`

## Cần làm tuần này (14/6 → 21/6)

### Backend (3 routers mới)
- [ ] `POST /api/documents/upload` — upload file (Quý)
- [ ] `POST /api/questions/generate` — sinh câu hỏi (Dev C)
- [ ] `POST /api/code/scan` — quét code (Dev A)
- [ ] `services/code_parser.py` — unzip + đọc source code (Quý)
- [ ] `services/question_generator.py` — logic sinh câu hỏi (Dev C)
- [ ] `services/code_reviewer.py` — logic quét code (Dev A)

### Frontend (kết nối API thật)
- [ ] `lib/api.ts` — Axios instance (Dev A)
- [ ] UploadZone → POST /api/documents/upload (Dev A)
- [ ] Questions page → real API (Dev A)
- [ ] Code Review page → real API (Dev A)
- [ ] Mock Room + Report → API hoặc mock data (Dev C)

## Milestone

| Ngày | Milestone | Trạng thái |
|------|-----------|-----------|
| 14/6 | Upload API hoạt động | ⏳ |
| 15/6 | Question Generation end-to-end | ⏳ |
| 16/6 | Code Review end-to-end | ⏳ |
| 17/6 | All 3 flows connected | ⏳ |
| 18/6 | Mock Room + Report có nội dung | ⏳ |
| 19/6 | Demo chạy mượt 3 lần | ⏳ |
| 20/6 | Final push, sẵn sàng demo | ⏳ |
| **21/6** | **DEMO** | 🎯 |
