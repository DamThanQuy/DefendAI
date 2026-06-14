# 01 — Documents API

> Upload, lưu trữ và quản lý tài liệu (PDF/DOCX/PPTX/ZIP).

## Overview

Module xử lý file upload từ user. File binary lưu trên disk (`uploads/`), metadata lưu trong PostgreSQL table `documents`.

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/documents/upload` | Upload file (multipart) |
| GET | `/api/documents/{id}` | Lấy metadata 1 document |
| GET | `/api/documents` | Danh sách tất cả documents |

---

## POST `/api/documents/upload`

Upload 1 file lên hệ thống. Validate extension + size, lưu disk + DB.

### Request

```
Content-Type: multipart/form-data
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `file` | File | ✅ | File upload (PDF/DOCX/PPTX/ZIP, max 100MB) |

### Config

```python
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".zip"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

EXTENSION_TO_DOCTYPE = {
    ".pdf": DocType.PDF,
    ".docx": DocType.DOCX,
    ".pptx": DocType.PPTX,
    ".zip": DocType.ZIP,
}
```

### Response (201 Created)

```json
{
  "id": 1,
  "filename": "report.pdf",
  "doc_type": "pdf",
  "status": "uploaded",
  "file_path": "uploads/a1b2c3d4e5f6_report.pdf",
  "created_at": "2026-06-14T12:00:00Z"
}
```

### DB Record (`documents` table)

| Field | Type | Ví dụ |
|-------|------|-------|
| `id` | int (PK) | 1 |
| `filename` | string(255) | `report.pdf` |
| `doc_type` | enum | `pdf`, `docx`, `pptx`, `zip` |
| `status` | enum | `uploaded`, `processing`, `completed`, `failed` |
| `file_path` | string(512) | `uploads/a1b2c3d4e5f6_report.pdf` |
| `created_at` | datetime | `2026-06-14 12:00:00` |

### Flow

```
User upload file (.pdf/.docx/.pptx/.zip)
        ↓
POST /api/documents/upload (multipart)
        ↓
┌─────────────────────────────────────────────────┐
│ 1. Validate extension (.pdf/.docx/.pptx/.zip)   │
│ 2. Read file content + validate size (≤100MB)   │
│ 3. Lưu file binary → disk (uploads/uuid_name)   │
│ 4. Tạo Document record trong DB                 │
│ 5. Return DocumentResponse                      │
└─────────────────────────────────────────────────┘
```

---

## GET `/api/documents/{doc_id}`

Lấy metadata của 1 document theo ID.

### Response (200 OK)

```json
{
  "id": 1,
  "filename": "report.pdf",
  "doc_type": "pdf",
  "status": "uploaded",
  "file_path": "uploads/a1b2c3d4e5f6_report.pdf",
  "created_at": "2026-06-14T12:00:00Z"
}
```

### Error (404 Not Found)

```json
{
  "detail": "Document 1 not found"
}
```

---

## GET `/api/documents/`

List tất cả documents, sắp xếp mới nhất lên đầu.

### Response (200 OK)

```json
{
  "total": 5,
  "items": [
    {
      "id": 5,
      "filename": "slides.pptx",
      "doc_type": "pptx",
      "status": "uploaded",
      "file_path": "uploads/...",
      "created_at": "2026-06-14T12:00:00Z"
    },
    ...
  ]
}
```

---

## Edge Cases

> **Cập nhật ngày 14/6/2026** — Đối chiếu với code thực tế: `documents.py` (router), `document_parser.py` (service).

### Bảo mật

| Trường hợp ngoại lệ | Rủi ro | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **Zip bomb / giải nén bom** | File ZIP nén nhiều lớp, giải nén > 1TB → đầy disk | 🔴 Cao | ❌ Chưa giải quyết | Chưa có code xử lý ZIP trong upload router. Cần thêm giới hạn kích thước giải nén khi implement code parser cho ZIP. |
| **Giả mạo phần mở rộng file** | Đổi đuôi `.exe` → `.pdf`, server vẫn lưu → mã độc | 🔴 Cao | ❌ Chưa giải quyết | Chỉ kiểm tra extension (`Path(filename).suffix`), chưa kiểm tra magic bytes. |
| **Path traversal** | Tên file `../../../etc/passwd` ghi đè file hệ thống | 🔴 Cao | ⚠️ Chưa đầy đủ | `_save_file()` dùng `uuid + filename` để tạo tên unique, nhưng **không sanitize** tên file gốc (không filter `..`, `/`). Vì file chỉ lưu (không resolve lại theo user path) nên rủi ro thấp, nhưng chưa an toàn tuyệt đối. |
| **ZIP chứa file thực thi** | File `.exe` / `.bat` / `.sh` ẩn trong ZIP | 🟡 Trung bình | ❌ Chưa giải quyết | Chưa có code parse ZIP trong upload router. Cần whitelist extension khi implement ZIP parser. |

### Chất lượng tài liệu

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **PDF scan / chỉ có ảnh** | Không có lớp text → AI không đọc được nội dung | 🔴 Cao | ✅ Đã giải quyết | `document_parser.py` có `MIN_TEXT_LENGTH_WARN = 50` → log warning khi text quá ngắn. OCR pipeline sẽ được thêm sau. |
| **PDF chứa sơ đồ, ảnh minh họa** | Mất thông tin quan trọng (diagrams, charts) | 🟡 Trung bình | ❌ Chưa giải quyết | Cần Vision AI (GPT-4V / Gemini) cho MVP phase 2. |
| **PDF có mật khẩu bảo vệ** | PyPDF2 báo lỗi → server crash | 🔴 Cao | ✅ Đã giải quyết | `_extract_pdf()` bắt lỗi qua try/except trong loop từng trang + `extract_text()` bắt lỗi chung → raise `DocumentParserError`, không crash server. |
| **File rỗng (0 bytes)** | Upload thành công nhưng không dùng được | 🔴 Cao | ❌ Chưa giải quyết | Chưa kiểm tra `len(content) == 0` trong router. |
| **File hỏng (corrupt)** | Parser crash khi đọc | 🟡 Trung bình | ✅ Đã giải quyết | `extract_text()` có try/except bao wrapping toàn bộ quá trình extract → raise `DocumentParserError` thay vì crash. |
| **DOCX/PPTX chỉ có ảnh, không text** | Giống PDF scan — trích xuất được 0 ký tự | 🟡 Trung bình | ⚠️ Chưa đầy đủ | `MIN_TEXT_LENGTH_WARN` chỉ log warning cho PDF. Chưa áp dụng kiểm tra này cho DOCX/PPTX (cần thêm check sau khi extract ở router level). |

### Kích thước & Cấu trúc

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **ZIP quá sâu (thư mục lồng nhau)** | Đường dẫn dài `a/b/c/.../file.py` vượt giới hạn OS | 🟡 Trung bình | ❌ Chưa giải quyết | Chưa implement ZIP parser. |
| **ZIP chứa >1000 files** | Quá nhiều code, không đủ context window cho AI | 🟡 Trung bình | ❌ Chưa giải quyết | Chưa implement ZIP parser. |
| **File code >2000 dòng** | Chưa implement chunking code | 🟡 Trung bình | ⚠️ Một phần | `chunk_text()` đã implement chunking text (~4000 chars/chunk), nhưng chưa áp dụng riêng cho file code (code parser chưa tích hợp). |
| **Tên file Unicode đặc biệt** | Tiếng Việt có dấu, emoji, ký tự đặc biệt | 🟢 Thấp | ✅ Đã giải quyết | Python xử lý Unicode native, `String(255)` trong SQLAlchemy hỗ trợ UTF-8. |
| **Tên file >255 ký tự** | Vượt giới hạn cột `String(255)` | 🟡 Trung bình | ❌ Chưa giải quyết | Chưa cắt tên file trước khi lưu DB. |

### Logic nghiệp vụ

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **Upload trùng lặp (cùng 1 file)** | Lãng phí DB record + dung lượng disk | 🟡 Trung bình | ❌ Chưa giải quyết | Chưa có SHA-256 hash check. Mỗi upload tạo record mới. |
| **File không liên quan (video/audio/binary)** | Extension không khớp, nhưng trong ZIP thì không kiểm tra | 🟡 Trung bình | ❌ Chưa giải quyết | Chỉ validate extension ở level upload. ZIP parser chưa implement. |
| **Tài liệu quá ngắn (< 50 ký tự)** | AI không sinh được câu hỏi hữu ích | 🟢 Thấp | ✅ Đã giải quyết | `MIN_TEXT_LENGTH_WARN = 50` trong `document_parser.py` → log warning. Router trả text ngắn nhưng không block. |
| **Tài liệu hỗn hợp ngôn ngữ** | Tiếng Việt + Anh + code → chunking sai ranh giới | 🟢 Thấp | ❌ Chưa giải quyết | Không cần xử lý đặc biệt cho MVP. |
| **Bảng biểu phức tạp trong PDF** | Ô merge, nhiều dòng → text extract sai thứ tự | 🟢 Thấp | ❌ Chưa giải quyết | PyPDF2 xử lý kém. Nâng cấp lên `pdfplumber` hoặc OCR sau MVP. |

### Tóm tắt trạng thái

| Trạng thái | Số lượng |
|------------|----------|
| ✅ Đã giải quyết | **6** |
| ⚠️ Chưa đầy đủ / Một phần | **3** |
| ❌ Chưa giải quyết | **12** |

---

## Related

- Code: [`apps/api/app/routers/documents.py`](../../apps/api/app/routers/documents.py)
- Code: [`apps/api/app/services/document_parser.py`](../../apps/api/app/services/document_parser.py)
- Code: [`apps/api/app/schemas/document.py`](../../apps/api/app/schemas/document.py)
- Code: [`apps/api/app/models/entities.py`](../../apps/api/app/models/entities.py) — `Document`, `DocType`, `DocumentStatus`
- Frontend: [`apps/web/src/lib/api.ts`](../../apps/web/src/lib/api.ts) — `uploadDocument()`
- Architecture: [`12-api-design.md`](../architecture/12-api-design.md) — Overview
- Flow: [`FLOW.md`](../../FLOW.md) — Main Flow
