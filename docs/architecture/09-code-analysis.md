# 09 — Code Analysis

## Overview

Source code scanning pipeline — upload .zip → AI phân tích → phát hiện lỗi logic, code smell.

## Pipeline

```
Upload .zip → Extract → Filter files → Read content → Chunk → AI Analyze → Aggregate
```

## Steps

1. **Upload** file .zip → lưu vào storage
2. **Extract** zip, lấy file tree
3. **Filter** relevant files: `.py`, `.js`, `.ts`, `.java`, `.cs`, `.cpp`, `.html`, `.css`
4. **Skip**: `node_modules/`, `.git/`, `dist/`, `build/`, `package-lock.json`
5. **Chunk**: max 5 files per chunk, max 2000 lines per chunk
6. **AI Analyze** mỗi chunk
7. **Aggregate** results → trả về issues + suggestions

## MVP Decision

Không cần AST parsing thực sự. Dùng regex + AI để phân tích.  
AST thật (tree-sitter) sẽ thêm ở Phase 2.

## Response Format

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
    }
  ],
  "improvement_suggestions": ["..."],
  "estimated_pass_rate": 75
}
```

## Related Documents

- `07-ai-architecture.md` — AI Gateway
- `08-rag.md` — RAG pipeline
- `11-database.md` — Database schema