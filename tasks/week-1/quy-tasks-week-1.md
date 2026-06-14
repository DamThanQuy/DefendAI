# Task cho Quý — Sprint Demo (14/6 → 21/6)

**Vai trò:** Fullstack — Feature Owner: Upload API + Code Parser

---

## ĐÃ XONG (Tuần trước)

- [x] Setup FastAPI + config + AI Gateway (NVIDIA + Google)
- [x] Document parser service (PDF/DOCX/PPTX) — `services/document_parser.py`
- [x] 6 AI endpoints hoạt động
- [x] Push lên `feature/quy/week-1-foundation`

---

## Ngày 1 (14/6): Upload API

- [x] Tạo `app/routers/documents.py`:
  - `POST /api/documents/upload` — nhận file multipart, validate type (.pdf/.docx/.pptx/.zip) + size (max 100MB), lưu vào `uploads/`, tạo record DB
  - `GET /api/documents/{id}` — lấy metadata 1 file
  - `GET /api/documents` — list tất cả files
- [x] Tạo `app/schemas/document.py` — DocumentResponse, DocumentListResponse
- [x] Tạo thư mục `uploads/` + `.gitkeep`
- [x] Register document router vào `main.py`
- [ ] Test với curl: upload 1 file PDF → verify file lưu + DB record tạo (cần PostgreSQL)
- [x] Fix bug: xóa `Session.documents` relationship thiếu FK gây crash toàn app

### Kiến trúc lưu file — Q&A

**Q: File lưu vào DB thế nào?**
A: Chỉ lưu **metadata** trên DB, file binary nằm trên **disk** (`uploads/`):
| Field | Ví dụ |
|-------|-------|
| filename | `report.pdf` |
| doc_type | `pdf` (enum) |
| file_path | `uploads/abc123_report.pdf` |
| status | `uploaded` |

**Q: Agent (AI) đọc file PDF thế nào?**
A: `services/document_parser.py` dùng **PyPDF2** trích xuất text layer thuần túy.
Text được chia chunks (~4000 chars) → lưu vào `assessments.chunks` (JSONB) → AI đọc chunks.

**Q: PDF chứa ảnh/sơ đồ thì sao?**
A: **Hiện tại CHƯA XỬ LÝ.** Cần bổ sung sau:
1. Nếu text trích xuất < 50 chars → xác định file là scan/ảnh
2. Convert trang PDF → ảnh → OCR (Tesseract / Google Vision API) → text
3. Nếu vẫn ít → Vision AI (GPT-4V / Gemini) mô tả nội dung ảnh, sơ đồ

---

## Ngày 2 (15/6): Code Parser

- [ ] Tạo `app/services/code_parser.py`:
  - Unzip file .zip vào temp dir
  - Đọc file code: `.py`, `.js`, `.ts`, `.java`, `.cs`, `.cpp`, `.html`, `.css`, `.vue`, `.jsx`, `.tsx`
  - Bỏ qua: `node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`, `.env`
  - Max 2000 dòng/file, gom tất cả code thành 1 string
- [ ] Test unzip 1 project mẫu → in ra console

---

## Ngày 3 (16/6): Prompt Code Review

- [ ] Viết prompt Code Review (trong `.ai/prompts/code-review.md` hoặc inline):
  - Phát hiện: logic_error, code_smell, missing_validation, error_handling
  - Trả về JSON: `{ issues: [{type, file, line, description, severity, suggestion}], summary, pass_rate }`
- [ ] Test prompt với 1 project mẫu qua AI Gateway

---

## Ngày 4-7: Support + Fix

- [ ] Verify document_parser hoạt động đúng với upload flow
- [ ] Đảm bảo backend stable, không crash khi upload nhiều file
- [ ] Chuẩn bị file mẫu demo (PDF, DOCX, .zip)
- [ ] Viết script demo step-by-step
- [ ] Final commit + push

---

## Files tạo/sửa

| File | Trạng thái |
|------|-----------|
| `apps/api/app/routers/documents.py` | 🆕 Tạo mới |
| `apps/api/app/schemas/document.py` | 🆕 Tạo mới |
| `apps/api/app/services/code_parser.py` | 🆕 Tạo mới |
| `apps/api/app/main.py` | ✏️ Đăng ký router |
| `apps/api/uploads/` | 🆕 Tạo thư mục |
