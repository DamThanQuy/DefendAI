# 📋 Task cho Quý (Dev B) — Tuần 1: AI Pipeline

**Vai trò:** AI Engineer + Backend

---

## Ngày 1-2: Setup FastAPI + Test AI API

- [ ] Setup project FastAPI (đã có sẵn `app/main.py`, cần hoàn thiện)
- [ ] Tạo file `app/core/config.py` — config từ env (DATABASE_URL, API keys, v.v.)
- [ ] Đăng ký tài khoản OpenAI (GPT-4o) hoặc Google (Gemini 1.5 Pro)
- [ ] Test gọi API thành công từ Python
- [ ] Tạo file `app/services/ai_client.py` — wrapper gọi AI API
- [ ] Commit & push lên branch `quy/ai-pipeline`

**Checklist:**
- [ ] `uvicorn app.main:app --reload` chạy được
- [ ] `GET /` và `GET /health` trả về kết quả
- [ ] AI API trả về response khi gọi thử

---

## Ngày 3-4: Prompt Engineering + Document Parser + Source Code Parser

- [ ] Tạo file `app/services/document_parser.py` — parse text từ:
  - [ ] `.pdf` → PyPDF2
  - [ ] `.docx` → python-docx
  - [ ] `.pptx` → python-pptx
- [ ] Thử nghiệm parse 1 file mẫu, in ra console được text
- [ ] **🔥 MỚI: Tạo file `app/services/code_parser.py`** — parse source code:
  - [ ] Unzip file `.zip`
  - [ ] Đọc các file code: `.py`, `.js`, `.ts`, `.java`, `.cs`, `.cpp`, `.html`, `.css`
  - [ ] Bỏ qua thư mục `node_modules/`, `.git/`, `dist/`, `build/`
  - [ ] Gom tất cả code text thành 1 string để gửi AI
- [ ] Test parse 1 project mẫu (ví dụ clone 1 repo nhỏ) → in ra console được
- [ ] **Prompt Engineering** — viết 3 system prompts cho 3 Persona:
  - [ ] **Persona 1 - Lý thuyết:** Giảng viên hàn lâm, chuyên bắt lỗi lý thuyết, phương pháp luận
  - [ ] **Persona 2 - Thực tế:** Chuyên gia doanh nghiệp, hỏi về ứng dụng thực tế, khả thi
  - [ ] **Persona 3 - Khắt khe:** Hội đồng khó tính, bắt bẻ logic, số liệu, trích dẫn
- [ ] **🔥 MỚI: Viết prompt cho Code Review AI** — phát hiện:
  - [ ] Lỗi logic, bug tiềm ẩn
  - [ ] Code smell, vi phạm coding convention
  - [ ] Thiếu validation, thiếu error handling
  - [ ] Đề xuất cải thiện cụ thể
- [ ] Test thử mỗi Persona với 1 tài liệu mẫu → xem chất lượng câu hỏi
- [ ] Test thử Code Review prompt với 1 project mẫu → xem chất lượng

**Tip:** Prompt nên yêu cầu AI trả về JSON format để dễ parse:
```json
[
  {
    "persona": "ly_thuyet",
    "question": "Cơ sở lý thuyết nào...",
    "hint": "Gợi ý: Cần nhắc đến...",
    "difficulty": "hard"
  }
]
```

---

## Ngày 5-6: API `/generate-questions` + API `/scan-code`

### 5a. API `/generate-questions`

- [ ] Tạo file `app/schemas/question.py` — Pydantic models
- [ ] Tạo file `app/services/question_generator.py` — logic chính:
  - [ ] Nhận text tài liệu + persona
  - [ ] Gọi AI với prompt tương ứng
  - [ ] Parse response JSON
  - [ ] Trả về danh sách câu hỏi
- [ ] Tạo file `app/routers/questions.py` — endpoint:
  - [ ] `POST /api/questions/generate` — nhận `document_id + persona`
  - [ ] Trả về `{ questions: [...], document_summary: "..." }`
- [ ] Register router vào `main.py`
- [ ] Test với Postman/cURL

**Endpoint mẫu:**
```python
@router.post("/api/questions/generate")
async def generate_questions(
    document_id: int,
    persona: str = "ly_thuyet"  # ly_thuyet | thuc_te | khat_khe
):
    # 1. Lấy file từ DB theo document_id
    # 2. Parse text
    # 3. Gọi AI với prompt persona
    # 4. Trả về 10 câu hỏi + gợi ý
    ...
```

### 5b. 🔥 MỚI: API `/scan-code`

- [ ] Tạo file `app/schemas/code_review.py` — Pydantic models
- [ ] Tạo file `app/services/code_reviewer.py` — logic:
  - [ ] Nhận code_text từ `code_parser.py`
  - [ ] Gọi AI với prompt Code Review
  - [ ] Parse response JSON
  - [ ] Trả về: `{ issues: [...], summary: "...", improvement_suggestions: [...] }`
- [ ] Tạo file `app/routers/code_review.py` — endpoint:
  - [ ] `POST /api/code/scan` — nhận `document_id` (là file .zip đã upload)
  - [ ] Trả về kết quả phân tích code
- [ ] Test với Postman
- [ ] Register router vào `main.py`

**Format trả về mẫu:**
```json
{
  "summary": "Phát hiện 5 vấn đề trong source code...",
  "issues": [
    {
      "type": "logic_error",
      "file": "src/app.py",
      "line": 42,
      "description": "Thiếu validation cho user input",
      "severity": "high",
      "suggestion": "Thêm kiểm tra dữ liệu đầu vào..."
    },
    {
      "type": "code_smell",
      "file": "src/utils.py",
      "line": 15,
      "description": "Hàm quá dài (> 50 dòng)",
      "severity": "medium",
      "suggestion": "Tách thành các hàm nhỏ hơn..."
    }
  ],
  "improvement_suggestions": ["...", "..."],
  "estimated_pass_rate": 75
}
```

---

## Ngày 7: Optimization + Integration

- [ ] Tối ưu prompt để giảm số lượng tokens (tiết kiệm cost)
- [ ] Thêm error handling (file lỗi, AI timeout, v.v.)
- [ ] Thêm logging
- [ ] Hỗ trợ Dev A + C test luồng end-to-end
- [ ] Viết document ngắn cho API (trong README hoặc Swagger)

---

## 🏆 Milestone M1: Cuối ngày 7

**Pass criteria:**
```bash
# 1. Upload file tài liệu test
curl -X POST http://localhost:8000/api/upload -F "file=@test.pdf"

# 2. Generate questions
curl -X POST http://localhost:8000/api/questions/generate \
  -H "Content-Type: application/json" \
  -d '{"document_id": 1, "persona": "ly_thuyet"}'
# ✅ Phải trả về 10 câu hỏi + gợi ý dưới dạng JSON

# 3. Upload source code test
curl -X POST http://localhost:8000/api/upload -F "file=@project.zip"

# 4. Scan code
curl -X POST http://localhost:8000/api/code/scan \
  -H "Content-Type: application/json" \
  -d '{"document_id": 2}'
# ✅ Phải trả về danh sách lỗi + đề xuất cải thiện
```

---

## 📁 Files bạn cần tạo/ chỉnh sửa

| File | Trạng thái | Ghi chú |
|------|-----------|---------|
| `apps/api/app/core/config.py` | 🆕 Tạo mới | Config từ env |
| `apps/api/app/services/ai_client.py` | 🆕 Tạo mới | AI API wrapper |
| `apps/api/app/services/document_parser.py` | 🆕 Tạo mới | Parse PDF/DOCX/PPTX |
| `apps/api/app/services/code_parser.py` | 🆕 **MỚI** | Unzip + đọc source code |
| `apps/api/app/services/question_generator.py` | 🆕 Tạo mới | Gen question logic |
| `apps/api/app/services/code_reviewer.py` | 🆕 **MỚI** | AI code review logic |
| `apps/api/app/schemas/question.py` | 🆕 Tạo mới | Pydantic models cho questions |
| `apps/api/app/schemas/code_review.py` | 🆕 **MỚI** | Pydantic models cho code review |
| `apps/api/app/routers/questions.py` | 🆕 Tạo mới | API /questions/generate |
| `apps/api/app/routers/code_review.py` | 🆕 **MỚI** | API /code/scan |
| `apps/api/app/main.py` | ✏️ Sửa | Register routers |
| `apps/api/.env` | 🆕 Tạo mới | Copy từ .env.example + điền key |
