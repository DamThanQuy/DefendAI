# 01 — Documents API

> Upload, lưu trữ và quản lý tài liệu (PDF/DOCX/PPTX/ZIP).

<a id="overview"></a>
## Overview

Module xử lý file upload từ user. File binary lưu trên disk (`uploads/`), metadata lưu trong PostgreSQL table `documents`.

<a id="endpoints"></a>
## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/documents/upload` | Upload file (multipart) |
| GET | `/api/documents/{id}` | Lấy metadata 1 document |
| GET | `/api/documents` | Danh sách tất cả documents |

---

<a id="upload"></a>
## POST `/api/documents/upload`

Upload 1 file lên hệ thống. Validate extension + size, lưu disk + DB.

<a id="request"></a>
### Request

```
Content-Type: multipart/form-data
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `file` | File | ✅ | File upload (PDF/DOCX/PPTX/ZIP, max 100MB) |

<a id="config"></a>
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

<a id="response-201"></a>
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

<a id="db-schema"></a>
### DB Record (`documents` table)

| Field | Type | Ví dụ |
|-------|------|-------|
| `id` | int (PK) | 1 |
| `filename` | string(255) | `report.pdf` |
| `doc_type` | enum | `pdf`, `docx`, `pptx`, `zip` |
| `status` | enum | `uploaded`, `processing`, `completed`, `failed` |
| `file_path` | string(512) | `uploads/a1b2c3d4e5f6_report.pdf` |
| `created_at` | datetime | `2026-06-14 12:00:00` |

<a id="flow"></a>
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

> **Cập nhật ngày 15/6/2026** — Đối chiếu với code thực tế: `documents.py` (router), `document_parser.py` (service).

### Bảo mật

| Trường hợp ngoại lệ | Rủi ro | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **Zip bomb / giải nén bom** | File ZIP nén nhiều lớp, giải nén > 1TB → đầy disk | 🔴 Cao | ❌ Chưa giải quyết | → [#zip-bomb](#zip-bomb) |
| **Giả mạo phần mở rộng file** | Đổi đuôi `.exe` → `.pdf`, server vẫn lưu → mã độc | 🔴 Cao | ✅ Đã giải quyết | → [#magic-bytes](#magic-bytes) |
| **Path traversal** | Tên file `../../../etc/passwd` ghi đè file hệ thống | 🔴 Cao | ✅ Đã giải quyết | → [#path-traversal](#path-traversal) |
| **ZIP chứa file thực thi** | File `.exe` / `.bat` / `.sh` ẩn trong ZIP | 🟡 Trung bình | ❌ Chưa giải quyết | → [#zip-executables](#zip-executables) |

### Chất lượng tài liệu

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **PDF scan / chỉ có ảnh** | Không có lớp text → AI không đọc được nội dung | 🔴 Cao | ✅ Đã giải quyết | → [#pdf-scan](#pdf-scan) |
| **PDF chứa sơ đồ, ảnh minh họa** | Mất thông tin quan trọng (diagrams, charts) | 🟡 Trung bình | ❌ Chưa giải quyết | → [#pdf-diagrams](#pdf-diagrams) |
| **PDF có mật khẩu bảo vệ** | PyPDF2 báo lỗi → server crash | 🔴 Cao | ✅ Đã giải quyết | → [#pdf-password](#pdf-password) |
| **File rỗng (0 bytes)** | Upload thành công nhưng không dùng được | 🔴 Cao | ✅ Đã giải quyết | → [#empty-file](#empty-file) |
| **File hỏng (corrupt)** | Parser crash khi đọc | 🟡 Trung bình | ✅ Đã giải quyết | → [#corrupt-file](#corrupt-file) |
| **DOCX/PPTX chỉ có ảnh, không text** | Giống PDF scan — trích xuất được 0 ký tự | 🟡 Trung bình | ⚠️ Chưa đầy đủ | → [#no-text-docx](#no-text-docx) |

### Kích thước & Cấu trúc

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **ZIP quá sâu (thư mục lồng nhau)** | Đường dẫn dài `a/b/c/.../file.py` vượt giới hạn OS | 🟡 Trung bình | ❌ Chưa giải quyết | → [#zip-nested](#zip-nested) |
| **ZIP chứa >1000 files** | Quá nhiều code, không đủ context window cho AI | 🟡 Trung bình | ❌ Chưa giải quyết | → [#zip-1000](#zip-1000) |
| **File code >2000 dòng** | Chưa implement chunking code | 🟡 Trung bình | ⚠️ Một phần | → [#code-2000](#code-2000) |
| **Tên file Unicode đặc biệt** | Tiếng Việt có dấu, emoji, ký tự đặc biệt | 🟢 Thấp | ✅ Đã giải quyết | → [#unicode-filename](#unicode-filename) |
| **Tên file >255 ký tự** | Vượt giới hạn cột `String(255)` | 🟡 Trung bình | ✅ Đã giải quyết | → [#long-filename](#long-filename) |

### Logic nghiệp vụ

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Trạng thái | Ghi chú |
|--------------------|--------|-------------|------------|---------|
| **Upload trùng lặp (cùng 1 file)** | Lãng phí DB record + dung lượng disk | 🟡 Trung bình | ❌ Chưa giải quyết | → [#dedup](#dedup) |
| **File không liên quan (video/audio/binary)** | Extension không khớp, nhưng trong ZIP thì không kiểm tra | 🟡 Trung bình | ❌ Chưa giải quyết | → [#unrelated-file](#unrelated-file) |
| **Tài liệu quá ngắn (< 50 ký tự)** | AI không sinh được câu hỏi hữu ích | 🟢 Thấp | ✅ Đã giải quyết | → [#short-doc](#short-doc) |
| **Tài liệu hỗn hợp ngôn ngữ** | Tiếng Việt + Anh + code → chunking sai ranh giới | 🟢 Thấp | ❌ Chưa giải quyết | → [#mixed-lang](#mixed-lang) |
| **Bảng biểu phức tạp trong PDF** | Ô merge, nhiều dòng → text extract sai thứ tự | 🟢 Thấp | ❌ Chưa giải quyết | → [#complex-table](#complex-table) |

### Tóm tắt trạng thái

| Trạng thái | Số lượng |
|------------|----------|
| ✅ Đã giải quyết | **10** |
| ⚠️ Chưa đầy đủ / Một phần | **3** |
| ❌ Chưa giải quyết | **8** |

---

<a id="plans"></a>
## Plans — Hướng dẫn giải quyết từng trường hợp

> Mỗi section dưới có `<a id="xxx">`. Bấm vào `→ #xxx` ở bảng trên để nhảy xuống trực tiếp.

<a id="zip-bomb"></a>
### Zip bomb / Giải nén bom

**Vấn đề:** File ZIP nén nhiều lớp → giải nén > 1 TB → đầy disk.

**Giải pháp:** Kiểm tra tỷ lệ `compress_size` / `uncompress_size` từ ZIP Central Directory (header), không giải nén toàn bộ. Nếu ratio > 50x, reject.

```python
def _check_zip_bomb(file_path: str) -> None:
    with zipfile.ZipFile(file_path, 'r') as zf:
        total_uncompressed = sum(f.file_size for f in zf.infolist())
        total_compressed = sum(f.compress_size for f in zf.infolist())
        ratio = total_uncompressed / (total_compressed or 1)
        if ratio > 50:
            os.remove(file_path)
            raise HTTPException(400, "Zip bomb detected: ratio > 50x")
```

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="magic-bytes"></a>
### Giả mạo phần mở rộng file — Magic bytes

**Vấn đề:** Đổi đuôi `.exe` → `.pdf`, server lưu → mã độc.

**Giải pháp:** `_validate_magic_bytes()` kiểm tra 4 byte đầu. DOCX/PPTX (ZIP-based) skip check.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="path-traversal"></a>
### Path traversal

**Vấn đề:** Tên file `../../../etc/passwd` → ghi đè file hệ thống.

**Giải pháp:** `_sanitize_filename()` dùng `os.path.basename()` + filter null bytes.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="zip-executables"></a>
### ZIP chứa file thực thi

**Vấn đề:** File `.exe` / `.bat` trong ZIP → không kiểm tra extension.

**Giải pháp:** Khi parse ZIP, duyệt từng file entry → chỉ cho phép extension trong whitelist (`.py`, `.js`, `.md`, ...). File không khớp → skip + log warning.

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="pdf-scan"></a>
### PDF scan / chỉ có ảnh

**Vấn đề:** PDF chỉ có ảnh scan → AI đọc được 0 text.

**Giải pháp:** `MIN_TEXT_LENGTH_WARN = 50` → log warning. OCR pipeline phase sau.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="pdf-diagrams"></a>
### PDF chứa sơ đồ, ảnh minh họa

**Vấn đề:** Mất thông tin diagrams/charts khi chỉ extract text.

**Giải pháp:** Cần Vision AI (GPT-4V / Gemini) cho phase 2. Hiện tại chỉ log + pass.

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="pdf-password"></a>
### PDF có mật khẩu bảo vệ

**Vấn đề:** PyPDF2 crash khi gặp PDF password.

**Giải pháp:** `_extract_pdf()` bắt lỗi qua try/except, không crash server.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="empty-file"></a>
### File rỗng (0 bytes)

**Vấn đề:** Upload thành công nhưng không dùng được.

**Giải pháp:** Kiểm tra `len(content) == 0` → trả 400 trước khi lưu.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="corrupt-file"></a>
### File hỏng (corrupt)

**Vấn đề:** Parser crash khi đọc file corrupt.

**Giải pháp:** `extract_text()` bao trong try/except → raise `DocumentParserError`.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="no-text-docx"></a>
### DOCX/PPTX chỉ có ảnh, không text

**Vấn đề:** Trích xuất 0 ký tự → giống PDF scan.

**Giải pháp:** Mở rộng `MIN_TEXT_LENGTH_WARN` cho DOCX/PPTX. Thêm check ở router level sau khi extract.

**Trạng thái:** ⚠️ Chưa đầy đủ.

---

<a id="zip-nested"></a>
### ZIP quá sâu (thư mục lồng nhau)

**Vấn đề:** Đường dẫn ZIP `a/b/c/.../z/file.py` > 255 ký tự, vượt OS.

**Giải pháp:** Giới hạn độ sâu 10 cấp khi parse ZIP. Nếu vượt → skip + log.

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="zip-1000"></a>
### ZIP chứa > 1000 files

**Vấn đề:** Quá nhiều file → không đủ context cho AI.

**Giải pháp:** Giới hạn 100 files / ZIP. Nếu vượt → chọn top 100 files quan trọng nhất (ưu tiên `.py`, `.md`).

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="code-2000"></a>
### File code > 2000 dòng

**Vấn đề:** Chưa có chunking code riêng.

**Giải pháp:** `chunk_text()` đã có split ~4000 ký tự. Cần tạo `CodeChunker` riêng (chunk theo function boundary thay vì ký tự).

**Trạng thái:** ⚠️ Một phần.

---

<a id="unicode-filename"></a>
### Tên file Unicode đặc biệt

**Vấn đề:** Tiếng Việt có dấu, emoji → SQLAlchemy có hỗ trợ không?

**Giải pháp:** Python `String(255)` + UTF-8 native. Không cần action.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="long-filename"></a>
### Tên file > 255 ký tự

**Vấn đề:** Vượt `String(255)`.

**Giải pháp:** `_sanitize_filename()` truncate stem tại 200, giữ extension.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="dedup"></a>
### Upload trùng lặp (cùng 1 file)

**Vấn đề:** Mỗi upload tạo 1 DB record → lãng phí disk.

**Giải pháp:** Tính `content_hash = hashlib.sha256(content)` trước khi lưu. Nếu hash tồn tại → return existing.

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="unrelated-file"></a>
### File không liên quan (video/audio/binary)

**Vấn đề:** Extension không khớp, nhưng trong ZIP thì không kiểm tra.

**Giải pháp:** Mở rộng magic bytes check cho từng file trong ZIP (không chỉ file gốc).

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="short-doc"></a>
### Tài liệu quá ngắn (< 50 ký tự)

**Vấn đề:** AI không sinh được câu hỏi.

**Giải pháp:** `MIN_TEXT_LENGTH_WARN = 50` → log + return ngắn.

**Trạng thái:** ✅ Đã giải quyết.

---

<a id="mixed-lang"></a>
### Tài liệu hỗn hợp ngôn ngữ

**Vấn đề:** Tiếng Việt + Anh + code → chunking sai ranh giới.

**Giải pháp:** Không cần cho MVP. Dùng code-aware chunker sau này.

**Trạng thái:** ❌ Chưa giải quyết.

---

<a id="complex-table"></a>
### Bảng biểu phức tạp trong PDF

**Vấn đề:** Ô merge, nhiều dòng → text extract sai.

**Giải pháp:** Nâng cấp lên `pdfplumber` (giữ layout) hoặc OCR PDF sau MVP.

**Trạng thái:** ❌ Chưa giải quyết.

---

## Related

- Code: [`apps/api/app/routers/documents.py`](../../apps/api/app/routers/documents.py)
- Code: [`apps/api/app/services/document_parser.py`](../../apps/api/app/services/document_parser.py)
- Code: [`apps/api/app/schemas/document.py`](../../apps/api/app/schemas/document.py)
- Code: [`apps/api/app/models/entities.py`](../../apps/api/app/models/entities.py) — `Document`, `DocType`, `DocumentStatus`
- Frontend: [`apps/web/src/lib/api.ts`](../../apps/web/src/lib/api.ts) — `uploadDocument()`
- Architecture: [`12-api-design.md`](../architecture/12-api-design.md) — Overview
- Flow: [`FLOW.md`](../../FLOW.md) — Main Flow