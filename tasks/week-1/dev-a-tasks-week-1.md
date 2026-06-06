# 📋 Task cho Dev A — Tuần 1: Frontend

**Vai trò:** Lead Frontend + UI/UX

---

## Ngày 1-2: Setup Next.js + UI Kit + Upload Document

- [ ] Setup Next.js project với TypeScript + Tailwind CSS
- [ ] Tạo UI Kit cơ bản: Button, Input, Card, Modal, Loading spinner
- [ ] Tạo page **Upload Document**:
  - Drag & drop zone
  - Button chọn file
  - Preview file name + size + type
- [ ] Kết nối tạm với API upload (gọi mock hoặc API thật của Dev C)

**File chính:**
- `src/app/page.tsx` — trang chủ
- `src/components/ui/Button.tsx`, `Input.tsx`, `Card.tsx`
- `src/components/upload/UploadZone.tsx`
- `src/lib/api.ts` — axios instance

---

## Ngày 3-4: UI Document Preview + Tích hợp Upload API

- [ ] Tạo component **Document Preview** — hiển thị nội dung file:
  - PDF viewer (react-pdf hoặc iframe)
  - DOCX preview (chuyển sang text)
  - PPTX preview (chuyển sang slides)
- [ ] Kết nối API upload thật (gọi từ Dev C)
- [ ] Thêm loading state khi upload
- [ ] Thêm error handling (file quá lớn, sai định dạng)

---

## Ngày 5-6: UI AI Results — Hiển thị câu hỏi & gợi ý

- [ ] Gọi API `/generate-questions` từ Dev B
- [ ] UI danh sách **10 câu hỏi**:
  - Nhóm theo Persona (tab: Lý thuyết / Thực tế / Khắt khe)
  - Mỗi câu hỏi có: question text + hint (ẩn/hiện) + độ khó (badge)
  - Accordion để show/hide gợi ý trả lời
- [ ] Thêm nút **Generate lại** (chọn persona khác)
- [ ] Thêm nút **Tiếp tục → Mock Room** (chuyển sang tuần 2)

---

## Ngày 7: Integration Testing

- [ ] Test toàn luồng: Upload → AI Results → Hiển thị đẹp
- [ ] Fix responsive (mobile-first)
- [ ] Fix UI bugs
- [ ] Hỗ trợ Dev B + C test end-to-end

---

## Files cần tạo/chỉnh sửa

| File | Trạng thái | Ghi chú |
|------|-----------|---------|
| `src/app/page.tsx` | 🆕 Tạo | Trang chủ |
| `src/app/layout.tsx` | 🆕 Tạo | Root layout |
| `src/components/ui/Button.tsx` | 🆕 Tạo | Button component |
| `src/components/ui/Card.tsx` | 🆕 Tạo | Card component |
| `src/components/upload/UploadZone.tsx` | 🆕 Tạo | Upload drag & drop |
| `src/components/preview/DocumentPreview.tsx` | 🆕 Tạo | Preview file |
| `src/components/questions/QuestionList.tsx` | 🆕 Tạo | Danh sách câu hỏi |
| `src/lib/api.ts` | 🆕 Tạo | Axios instance |