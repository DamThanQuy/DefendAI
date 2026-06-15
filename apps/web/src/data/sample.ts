import type { Question, CodeIssue, Metric } from "@/types";

export const sampleQuestions: Question[] = [
  {
    id: 1,
    question: "Mục tiêu chính của hệ thống là gì?",
    hint: "Hệ thống hỗ trợ sinh viên ôn tập và tự tin hơn trước buổi bảo vệ đồ án.",
    difficulty: "easy",
    persona: "ly_thuyet",
  },
  {
    id: 2,
    question: "Bạn đã sử dụng công nghệ gì cho backend?",
    hint: "FastAPI (Python) kết hợp PostgreSQL để lưu trữ dữ liệu.",
    difficulty: "medium",
    persona: "thuc_te",
  },
  {
    id: 3,
    question: "Hệ thống xử lý file như thế nào?",
    hint: "Sử dụng document parser để trích xuất nội dung từ PDF, DOCX và mã nguồn.",
    difficulty: "hard",
    persona: "khat_khe",
  },
];

export const sampleIssues: CodeIssue[] = [
  {
    id: 1,
    type: "missing_validation",
    file: "app/main.py",
    line: 42,
    severity: "warning",
    description: "Biến `db` có thể chưa được khởi tạo khi hàm `get_db()` được gọi.",
    suggestion: "Thêm kiểm tra null hoặc đảm bảo dependency injection luôn cung cấp giá trị.",
  },
  {
    id: 2,
    type: "code_smell",
    file: "utils/parser.py",
    line: 18,
    severity: "info",
    description: "Hàm `parse_pdf()` sử dụng regex để trích xuất text, có thể bỏ sót định dạng phức tạp.",
    suggestion: "Cân nhắc sử dụng thư viện như PyMuPDF hoặc pdfplumber để cải thiện độ chính xác.",
  },
  {
    id: 3,
    type: "error_handling",
    file: "services/ai_service.py",
    line: 75,
    severity: "error",
    description: "Không có xử lý lỗi khi gọi API LLM thất bại.",
    suggestion: "Bọc trong try-except và trả về thông báo lỗi thân thiện cho người dùng.",
  },
];

export const sampleMetrics: Metric[] = [
  { label: "Tổng số câu hỏi", value: "12" },
  { label: "Điểm tự tin", value: "7.5/10" },
  { label: "Thời gian trả lời TB", value: "45s" },
  { label: "Tỷ lệ đúng", value: "83%" },
];
