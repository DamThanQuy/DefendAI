# AI Tools

Thư mục này chứa các công cụ (tools/scripts) được thiết kế riêng để hỗ trợ AI trong quá trình kiểm tra, phân tích và xử lý source code của dự án DefendAI.

## 1. Source Code Analyzer (`ai-tools/analyzer`)

Tool này giúp AI phân tích cấu trúc của file TypeScript/JavaScript (React, Next.js) bằng cách trích xuất Abstract Syntax Tree (AST) và chạy ESLint để phát hiện lỗi. Thay vì phải tự đọc toàn bộ file dài, AI có thể sử dụng tool này để trích xuất nhanh các thông tin quan trọng.

### Cách sử dụng (Dành cho AI)

Tool này được viết bằng Node.js và sử dụng thư viện `ts-morph`. Để chạy tool, hãy sử dụng command line từ thư mục `ai-tools/analyzer`.

**Lệnh cơ bản (trả về JSON):**
```bash
node d:\EXE101\DefendAI\ai-tools\analyzer\index.js --target <đường_dẫn_tới_file>
```
*Lưu ý: Bạn có thể cần dùng đường dẫn tương đối hoặc tuyệt đối tới file cần phân tích. Ví dụ: `..\..\apps\web\src\app\login\page.tsx`*

**Lệnh kết hợp phân tích tĩnh (ESLint):**
```bash
node d:\EXE101\DefendAI\ai-tools\analyzer\index.js --target <đường_dẫn_tới_file> --eslint
```

**Các tham số:**
- `-t, --target <path>`: Đường dẫn tới file cần phân tích (bắt buộc).
- `-o, --output <format>`: Định dạng đầu ra, mặc định là `json` (hỗ trợ: `json`, `text`).
- `--eslint`: Bật tính năng gọi ESLint trên file đích.

### Đầu ra (Output)
Tool trả về một object JSON (nếu `--output json`) chứa:
- `ast`: Cấu trúc file bao gồm `imports`, `exports`, `classes`, `functions`, `interfaces`, `types`.
- `eslint`: Kết quả phân tích tĩnh từ ESLint (nếu cờ `--eslint` được bật).

---
*Các tool khác sẽ được cập nhật thêm vào thư mục này.*
