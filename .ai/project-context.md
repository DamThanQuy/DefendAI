# .ai/ — AI Context Layer

> Thư mục này chứa context dành riêng cho AI Agent, không cho con người.

## Vai trò các file

| File | Vai trò |
|------|---------|
| `project-context.md` | Tổng quan project, tech stack, modules |
| `coding-guidelines.md` | Quy tắc code chi tiết (Python, TypeScript) |
| `agent-rules.md` | Rules cho AI Agent khi làm task |
| `architecture-summary.md` | Tóm tắt kiến trúc 1 trang |
| `prompts/` | Prompt templates cho từng tính năng |

## Lưu ý

- Files trong `.ai/` được tối ưu cho AI Agent đọc
- Mỗi file < 200 dòng để fit trong context window
- Version control như code (commit thường xuyên)
- Cập nhật khi thay đổi architecture hoặc convention

## Workflow

Khi AI Agent bắt đầu task:
1. Đọc `README_FOR_AI.md` (root)
2. Đọc files trong `.ai/` cần thiết
3. Đọc files trong `docs/` theo task
4. Implement theo guidelines