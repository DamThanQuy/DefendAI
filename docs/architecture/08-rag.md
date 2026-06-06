# 08 — RAG Pipeline

## Overview

Retrieval-Augmented Generation pipeline cho MVP. Dùng chunk + prompt, chưa cần vector DB.

## Pipeline

```
Upload Document → Parse Text → Chunk (by paragraph) → Build Prompt → LLM → JSON
```

## MVP Approach

Do tài liệu sinh viên thường < 50 trang, MVP dùng RAG đơn giản:

1. **Parse** full text từ PDF/DOCX/PPTX
2. **Chunk** by `\n\n` (paragraph), max 1000 tokens mỗi chunk, tối đa 10 chunks
3. **Build prompt**: `[System Prompt (Persona)] + [Tối đa 5000 tokens chunks] + [Instruction]`
4. **Gọi AI** qua Gateway
5. **Parse** JSON response → trả về frontend

## Code

```python
class AssessmentPipeline:
    async def run(self, document_text: str, persona: str) -> list[Question]:
        chunks = self._chunk_text(document_text, max_tokens=1000)
        prompt = self._build_prompt(chunks, persona)
        response = await self.ai.generate(AIRequest(
            prompt=prompt,
            system_prompt=self._get_system_prompt(persona),
            response_format="json"
        ))
        return self._parse_questions(response.content)
```

## Future (Phase 3)

- Thêm Embedding → pgvector → semantic search
- LangChain / LlamaIndex cho pipeline phức tạp hơn
- Multi-turn conversation

## Related Documents

- `07-ai-architecture.md` — AI Gateway
- `09-code-analysis.md` — Code Analysis
- `11-database.md` — Database schema