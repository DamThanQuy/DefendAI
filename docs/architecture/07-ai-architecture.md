# 07 — AI Architecture

## Overview

AI Gateway abstraction layer — switch between OpenAI / Gemini without changing business logic.

## Architecture

```
Business Logic (question_service, code_reviewer)
         │
         ▼
   AI Gateway (abstract)
         │
    ┌────┴────┐
    ▼         ▼
OpenAI    Gemini
Provider  Provider
```

## AIGateway Interface

```python
@dataclass
class AIRequest:
    prompt: str
    system_prompt: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2000
    response_format: str = "json"

@dataclass
class AIResponse:
    content: str
    usage: dict
    latency_ms: int
    provider: str

class AIGateway(ABC):
    async def generate(self, request: AIRequest) -> AIResponse: ...
    async def chat(self, messages: list, request: AIRequest) -> AIResponse: ...
```

## Providers

| Provider | Class | Model | Status |
|----------|-------|-------|--------|
| OpenAI | `OpenAIProvider` | gpt-4o | ✅ MVP |
| Gemini | `GeminiProvider` | gemini-1.5-pro | 🔜 Future |

## Prompt System

```
shared/ai/prompts/
├── personas/
│   ├── theory_professor.py     # "Bạn là giáo sư đại học..."
│   ├── enterprise_reviewer.py  # "Bạn là chuyên gia doanh nghiệp..."
│   └── strict_examiner.py      # "Bạn là hội đồng khó tính..."
├── code_review/
│   └── review.py               # "Phân tích source code..."
└── evaluation/
    └── feedback.py             # "Tổng hợp điểm yếu..."
```

## Pipeline

```
1. Chunk text
2. Build prompt: [System Prompt] + [Chunks] + [Instruction]
3. Call AI via Gateway
4. Parse JSON response
5. Return structured output
```

## Related Documents

- `08-rag.md` — RAG Pipeline
- `09-code-analysis.md` — Code Analysis
- `05-backend.md` — Backend
- `decisions/ADR-002-ai-gateway.md`