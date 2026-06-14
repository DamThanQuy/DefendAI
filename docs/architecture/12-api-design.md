# 12 — Thiết kế API

## Tổng quan

Các endpoint RESTful cho tất cả modules. Prefix: `/api/v1`

## Danh sách Endpoint

### Đánh giá (Assessment)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/assessment/generate-questions` | AI sinh 10 câu hỏi |
| GET | `/api/v1/assessment/jobs/{job_id}` | Kiểm tra trạng thái job |

### Phân tích mã nguồn (Code Analysis)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/code/scan` | AI quét mã nguồn |
| GET | `/api/v1/code/jobs/{job_id}` | Kiểm tra trạng thái job |

### Tài liệu (Documents)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/documents/upload` | Upload file |
| GET | `/api/v1/documents/{id}` | Lấy thông tin tài liệu |
| GET | `/api/v1/documents` | Danh sách tài liệu |

### Phòng họp (Meeting)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/meeting/rooms` | Tạo phòng |
| GET | `/api/v1/meeting/rooms/{id}` | Lấy thông tin phòng |
| WS | `/api/v1/meeting/ws/{room_id}` | WebSocket |

### Đánh giá điểm (Evaluation)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/evaluation/scores` | Gửi điểm |
| GET | `/api/v1/evaluation/sessions/{id}/results` | Lấy kết quả |

### Báo cáo (Report)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/report/generate` | Tạo báo cáo PDF |
| GET | `/api/v1/report/{id}/pdf` | Tải PDF |

### Kiểm tra sức khỏe (Health)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| GET | `/health` | Kiểm tra server |

## Định dạng Response

```json
{
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2026-06-06T12:00:00Z",
    "version": "0.1.0"
  }
}
```

## Định dạng Lỗi

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Persona không hợp lệ. Phải là một trong: theory, enterprise, strict"
  },
  "meta": { "timestamp": "..." }
}
```

---

## Tài liệu — Các trường hợp ngoại lệ & Kiểm tra (Upload API `POST /api/documents/upload`)

### Bảo mật

| Trường hợp ngoại lệ | Rủi ro | Mức ưu tiên | Giải pháp đề xuất |
|--------------------|--------|-------------|-------------------|
| **Zip bomb / giải nén bom** | File ZIP nén nhiều lớp, giải nén > 1TB → đầy disk | 🔴 Cao | Giới hạn kích thước giải nén tối đa (vd 500MB) trong code parser |
| **Giả mạo phần mở rộng file** | Đổi đuôi `.exe` → `.pdf`, server vẫn lưu → mã độc | 🔴 Cao | Kiểm tra chữ ký file thực tế (magic bytes), không chỉ dựa vào đuôi mở rộng |
| **Path traversal** | Tên file `../../../etc/passwd` ghi đè file hệ thống | 🔴 Cao | Lọc tên file: chỉ lấy `Path(filename).name`, từ chối nếu chứa `..` hoặc `/` |
| **ZIP chứa file thực thi** | File `.exe` / `.bat` / `.sh` ẩn trong ZIP | 🟡 Trung bình | Chỉ chấp nhận danh sách extension code khi giải nén |

### Chất lượng tài liệu

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Giải pháp đề xuất |
|--------------------|--------|-------------|-------------------|
| **PDF scan / chỉ có ảnh** | Không có lớp text → AI không đọc được nội dung | 🔴 Cao | Phát hiện `len(text) < 50` → kích hoạt pipeline OCR (Tesseract / Google Vision) |
| **PDF chứa sơ đồ, ảnh minh họa** | Mất thông tin quan trọng (diagrams, charts) | 🟡 Trung bình | Dự phòng: gửi từng trang PDF (convert sang ảnh) cho Vision AI (GPT-4V / Gemini) mô tả |
| **PDF có mật khẩu bảo vệ** | PyPDF2 báo lỗi → server crash | 🔴 Cao | Bắt lỗi rõ ràng, trả `400 Bad Request: "File được bảo vệ bằng mật khẩu"` |
| **File rỗng (0 bytes)** | Upload thành công nhưng không dùng được | 🔴 Cao | Kiểm tra `len(content) == 0` → từ chối với mã 400 |
| **File hỏng (corrupt)** | Parser crash khi đọc | 🟡 Trung bình | Xử lý lỗi an toàn, log chi tiết, cập nhật DB status → `failed` |
| **DOCX/PPTX chỉ có ảnh, không text** | Giống PDF scan — trích xuất được 0 ký tự | 🟡 Trung bình | OCR dự phòng nếu text quá ngắn |

### Kích thước & Cấu trúc

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Giải pháp đề xuất |
|--------------------|--------|-------------|-------------------|
| **ZIP quá sâu (thư mục lồng nhau)** | Đường dẫn dài `a/b/c/.../file.py` vượt giới hạn OS | 🟡 Trung bình | Giới hạn độ sâu tối đa (vd 10 cấp) |
| **ZIP chứa >1000 files** | Quá nhiều code, không đủ context window cho AI | 🟡 Trung bình | Giới hạn số file xử lý (vd 100) |
| **File code >2000 dòng** | Chưa implement chunking code | 🟡 Trung bình | Chia file code thành các chunk, xử lý từng chunk |
| **Tên file Unicode đặc biệt** | Tiếng Việt có dấu, emoji, ký tự đặc biệt | 🟢 Thấp | Chỉ lưu tên file gốc, không kiểm tra thêm |
| **Tên file >255 ký tự** | Vượt giới hạn cột `String(255)` | 🟡 Trung bình | Cắt tên file xuống 255 ký tự |

### Logic nghiệp vụ

| Trường hợp ngoại lệ | Vấn đề | Mức ưu tiên | Giải pháp đề xuất |
|--------------------|--------|-------------|-------------------|
| **Upload trùng lặp (cùng 1 file)** | Lãng phí DB record + dung lượng disk | 🟡 Trung bình | Băm SHA-256 nội dung, nếu trùng hash → trả về tài liệu đã có |
| **File không liên quan (video/audio/binary)** | Extension không khớp, nhưng trong ZIP thì không kiểm tra | 🟡 Trung bình | Danh sách trắng extension code khi parse ZIP |
| **Tài liệu quá ngắn (< 50 ký tự)** | AI không sinh được câu hỏi hữu ích | 🟢 Thấp | Cảnh báo + thông báo cho người dùng trước khi generate questions |
| **Tài liệu hỗn hợp ngôn ngữ** | Tiếng Việt + Anh + code → chunking sai ranh giới | 🟢 Thấp | Không cần xử lý đặc biệt cho MVP |
| **Bảng biểu phức tạp trong PDF** | Ô merge, nhiều dòng → text extract sai thứ tự | 🟢 Thấp | PyPDF2 xử lý kém, nâng cấp lên `pdfplumber` hoặc OCR sau MVP |

---

## Tài liệu liên quan

- `05-backend.md` — Backend
- `03-module-design.md` — Modules
