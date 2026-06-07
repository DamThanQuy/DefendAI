# 📋 Task cho Quý (Dev B) — Tuần 1: AI Pipeline

**Vai trò:** AI Engineer + Backend

---

## Ngày 1-2: Setup FastAPI + Test AI API

- [x] Setup project FastAPI (đã có sẵn `app/main.py`, cần hoàn thiện)
- [x] Tạo file `app/core/config.py` — config từ env (DATABASE_URL, API keys, v.v.)
- [x] Đăng ký tài khoản AI (chuyển sang NVIDIA NIM + Google AI Studio)
- [x] Test gọi API thành công từ Python (Google Gemma 4 31B IT — 3.5s latency, response thật)
- [x] Tạo file `app/services/ai_client.py` — multi-provider gateway (NVIDIA + Google)
- [ ] Commit & push lên branch `quy/ai-pipeline` (git repo có vấn đề, chưa commit được)

**Checklist:**
- [x] `uvicorn app.main:app --reload` chạy được (verified qua TestClient)
- [x] `GET /` và `GET /health` trả về kết quả
- [x] AI API trả về response khi gọi thử

### 🆕 Bổ sung: Multi-Provider AI Gateway (Ngoài kế hoạch)

- [x] Search web MCP về model AI mới nhất 2026 (Step-3.7-Flash, Gemma 4 31B IT)
- [x] Update `.env` — thêm NVIDIA_API_KEY, GOOGLE_API_KEY + routing config
- [x] Tạo `app/services/ai_providers/base.py` — OpenAICompatibleProvider (httpx)
- [x] Tạo `app/services/ai_providers/nvidia.py` — wrapper NVIDIA NIM (Step-3.7-Flash)
- [x] Tạo `app/services/ai_providers/google.py` — wrapper Google AI Studio (Gemma 4 31B IT)
- [x] Refactor `app/services/ai_client.py` — AIGateway class + orchestrate/worker helpers
- [x] Tạo `app/schemas/ai.py` — AIRequest, AIResponse, AICompareRequest, AICompareResponse
- [x] Tạo `app/routers/ai.py` — 6 endpoints test:
  - `GET  /api/ai/providers` — list providers enabled
  - `GET  /api/ai/models` — list model gợi ý
  - `POST /api/ai/test` — gọi 1 model bất kỳ
  - `POST /api/ai/orchestrate` — gọi model lớn (NVIDIA)
  - `POST /api/ai/worker` — gọi model nhỏ (Google)
  - `POST /api/ai/compare` — gọi song song 2 provider, so sánh tốc độ
- [x] Register AI router vào `app/main.py`
- [x] Update `/health` endpoint — trả thêm `ai_providers` + `ai_ready`
- [x] Test 8 endpoints với TestClient — tất cả PASS, Google AI thật gọi được
- [x] Tạo `tests/test_ai_endpoints.py` — script test toàn bộ
- [x] Cleanup: xóa 4 file `__init__.py` rỗng (Python 3.3+ namespace package)

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

## 🔄 Luồng nghiệp vụ MVP (Week 1 — End-to-end)

### 1. Upload Tài liệu → AI Sinh câu hỏi (3 Persona)

```
User upload file tài liệu (PDF/DOCX/PPTX)
    ↓
[Frontend] UploadZone gửi multipart/form-data đến /api/upload
    ↓
[Backend - storage module] Lưu file vật lý + metadata (doc_id, file_type, name)
    ↓
return { document_id, status: "uploaded" }
    ↓
User click "Generate Questions" + chọn Persona:
  - ly_thuyet (Giảng viên hàn lâm)
  - thuc_te (Chuyên gia doanh nghiệp)
  - khat_khe (Hội đồng khắt khe)
    ↓
POST /api/questions/generate { document_id, persona }
    ↓
[Backend] Tạo job_id, trả về ngay { job_id }
    ↓
BackgroundTasks (async):
  1. Lấy text từ document_parser (PDF/DOCX/PPTX)
  2. Chunk by paragraph (max ~1000 tokens/chunk)
  3. Load system prompt theo persona từ .ai/prompts/persona/
  4. Gọi AI Gateway → LLM (GPT-4o/Gemini)
  5. Parse JSON response (10 câu hỏi + hint + difficulty)
  6. Lưu vào assessments table (JSONB)
  7. Cập nhật job status = completed
    ↓
Frontend poll /api/jobs/{job_id} mỗi 2s
    ↓
Job done → Hiển thị 10 câu hỏi theo từng tab Persona
    ↓
User có thể xem gợi ý trả lời + độ khó
```

### 2. Upload Source Code (.zip) → AI Quét lỗi Code Review

```
User upload file .zip (project source code)
    ↓
POST /api/upload -F "file=@project.zip"
    ↓
[Backend - storage module] Lưu file zip + metadata
    ↓
return { document_id, status: "uploaded" }
    ↓
User click "Scan Code"
    ↓
POST /api/code/scan { document_id }
    ↓
[Backend] Tạo job_id, trả về ngay { job_id }
    ↓
BackgroundTasks (async):
  1. Đọc file zip từ storage
  2. Unzip → lọc extension (.py, .js, .ts, .java, .cs, .cpp, .html, .css)
  3. Bỏ qua thư mục: node_modules/, .git/, dist/, build/
  4. Gom tất cả code text (max ~2000 lines/file)
  5. Gọi AI Gateway với prompt Code Review
     (phát hiện: logic_error, code_smell, missing_validation...)
  6. Parse JSON response
  7. Lưu vào code_analyses table
  8. Cập nhật job status = completed
    ↓
Frontend poll /api/jobs/{job_id}
    ↓
Job done → Hiển thị:
  - summary: Tổng quan số vấn đề
  - issues: [{ type, file, line, description, severity, suggestion }]
  - improvement_suggestions: [...]
  - estimated_pass_rate: 75
```

### 3. Polling Pattern (Async Job Status)

- Client gửi request → nhận `job_id` → poll `/api/jobs/{job_id}` mỗi 2 giây
- Server trả về: `{ status: "pending" | "processing" | "completed" | "failed" }`
- Khi `completed`: kèm theo `result` (questions/issues JSON)

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
| `apps/api/app/core/config.py` | ✅ Done | Config từ env |
| `apps/api/app/services/ai_client.py` | ✅ Done | AI API wrapper |
| `apps/api/app/schemas/question.py` | 🆕 Tạo mới | Pydantic models cho questions |
| `apps/api/app/schemas/code_review.py` | 🆕 **MỚI** | Pydantic models cho code review |
| `apps/api/app/routers/questions.py` | 🆕 Tạo mới | API /questions/generate |
| `apps/api/app/routers/code_review.py` | 🆕 **MỚI** | API /code/scan |
| `apps/api/app/main.py` | ✅ Done | Register routers |
| `apps/api/.env` | ✅ Done | Copy từ .env.example + điền key |
