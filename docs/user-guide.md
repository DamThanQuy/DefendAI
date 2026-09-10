# DefendAI — User Guide (Code Review & Question Generation)

## 📖 Giới thiệu

DefendAI là hệ thống hỗ trợ bảo vệ đồ án tốt nghiệp bằng AI. Tài liệu này hướng dẫn sinh viên sử dụng 2 tính năng chính:

1. **Code Review AI** — Phân tích chất lượng mã nguồn từ file ZIP/RAR
2. **AI Question Generation** — Sinh câu hỏi phản biện từ tài liệu đồ án

---

## 🧑‍💻 Code Review AI

### Cách sử dụng

1. **Tải lên file source code**
   - Truy cập trang `/code-review`
   - Bấm nút **"Chọn file ZIP/RAR"** để tải file mới lên
   - Hoặc bấm **"Chọn từ đã upload"** nếu đã có file trước đó

2. **Chạy phân tích**
   - Sau khi chọn file, bấm **"🔍 Chạy Code Review"**
   - Hệ thống sẽ:
     - Giải nén file ZIP/RAR
     - Phân loại có phải source code không (heuristic + AI fallback)
     - Chạy AI review từng module (tối đa 40 file/module)
     - Hiển thị kết quả với progress bar

3. **Xem kết quả**
   - **Panel trái**: File tree — nhấn vào file để xem code
   - **Panel giữa**: Code preview — số dòng + icon ⚠️ trên dòng có lỗi
   - **Panel phải**: Vấn đề (Issues) — lọc theo severity, tìm kiếm

### Phân loại issue

| Severity | Màu | Ý nghĩa |
|----------|-----|---------|
| CRITICAL / HIGH | Đỏ | Lỗi nghiêm trọng — cần sửa ngay |
| MEDIUM / WARNING | Cam | Cảnh báo — nên xem lại |
| LOW / OPTIMIZATION | Xanh | Gợi ý tối ưu — không bắt buộc |

### Troubleshooting

- **"File này không được xác định là source code"** → File ZIP chỉ chứa tài liệu (PDF, DOCX), không có code. Hãy dùng luồng **Đọc Tài liệu** thay thế.
- **Progress bar dừng ở một module** → AI provider đang xử lý, hãy kiên nhẫn. Nếu quá 5 phút, thử lại.
- **Cảnh báo "Dùng fallback"** → AI tạm không khả dụng, kết quả dùng heuristic pattern matching.

---

## 🤖 AI Question Generation

### Cách sử dụng

1. **Upload tài liệu đồ án** (PDF/DOCX) tại `/documents`
2. **Vào trang câu hỏi** `/questions`
3. **Xem kết quả** — AI đã sinh sẵn 10 câu hỏi phản biện
4. **Sinh lại** (nếu cần):
   - Bấm nút **"🔄 Sinh lại câu hỏi"**
   - Theo dõi progress bar (0–100%)
   - Đợi job hoàn thành → kết quả mới hiện lên

### Persona mặc định

Hiện tại hệ thống tự động chọn persona phù hợp nhất dựa trên nội dung tài liệu.

### Lưu ý

- Nếu tài liệu quá ngắn hoặc là hướng dẫn giảng viên → AI sẽ trả về 0 câu hỏi
- Kết quả có thể khác nhau mỗi lần sinh lại (do temperature = 0.2)
- Câu hỏi được phân loại: **Dễ / Trung bình / Khó**

---

## 📊 Hiểu điểm số (Mock Room)

Sau khi hoàn thành phiên Mock Room, bạn sẽ nhận được:

| Điểm | Mô tả |
|------|--------|
| **OGA** | Điểm phần thuyết trình, trả lời trực tiếp |
| **TDA** | Điểm phần chuẩn bị tài liệu, kỹ năng viết |

Mỗi CLO (7 tiêu chí SEP490) có trọng số riêng. Điểm yếu sẽ được gợi ý action item cụ thể.

---

## 🔗 Quick Links

| Trang | URL |
|-------|-----|
| Trang chủ | `/` |
| Upload tài liệu | `/documents` |
| Code Review | `/code-review` |
| Lịch sử Code Review | `/code-review/history` |
| AI Questions | `/questions` |
| Mock Room | `/room` |
| Báo cáo chi tiết | `/report` |
