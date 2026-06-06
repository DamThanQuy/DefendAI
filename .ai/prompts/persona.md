# Persona System — DefendAI

> File này định nghĩa các Persona cho AI Assessment.

## Overview

3 Personas được hỗ trợ trong MVP. Mỗi persona có một system prompt riêng,
lưu ở đây để AI Agent dễ tìm và modify.

## Personas

### 1. Theory Professor (`theory_professor`)

**ID:** `theory_professor`
**Tên tiếng Việt:** Giáo sư Lý thuyết
**Phong cách:** Hàn lâm, chuyên về lý thuyết, phương pháp luận

**Khi nào dùng:** Sinh viên muốn test độ sâu lý thuyết đồ án.

**System prompt location:** `assessment.md` (section 1)

### 2. Enterprise Reviewer (`enterprise_reviewer`)

**ID:** `enterprise_reviewer`
**Tên tiếng Việt:** Chuyên gia Doanh nghiệp
**Phong cách:** Thực tế, ứng dụng, business value

**Khi nào dùng:** Sinh viên muốn test tính khả thi thương mại.

**System prompt location:** `assessment.md` (section 2)

### 3. Strict Examiner (`strict_examiner`)

**ID:** `strict_examiner`
**Tên tiếng Việt:** Hội đồng Khắt khe
**Phong cách:** Bắt bẻ logic, số liệu, trích dẫn

**Khi nào dùng:** Sinh viên muốn stress test trước buổi bảo vệ thật.

**System prompt location:** `assessment.md` (section 3)

## Adding New Persona

Khi cần thêm persona mới:

1. Mở `assessment.md`
2. Thêm section mới với system prompt
3. Update enum trong code:
   - Backend: `PersonaType` enum
   - Frontend: `PersonaSelector` component
4. Update `docs/architecture/07-ai-architecture.md` nếu cần
5. Update `docs/FUNCTIONS.md` nếu persona mới có logic riêng
6. Commit với message `feat(assessment): add <name> persona`

## Best Practices

- System prompt nên ngắn gọn (200-300 tokens)
- Output format phải consistent
- Persona nên có persona cụ thể, không generic
- Test persona với 1-2 documents thật trước khi ship