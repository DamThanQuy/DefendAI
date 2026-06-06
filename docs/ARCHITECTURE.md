# 🏗 Architecture Design Document — DefendAI

> **Version:** 2.0 (Refactored)  
> **Author:** Principal Software Architect  
> **Target:** MVP 3 tuần — 3 developers — Scale-ready  
> **Philosophy:** Clean Architecture · Vertical Slices · AI-First · Async by default

---

## 1. Executive Summary

**DefendAI** là nền tảng AI Mock Graduation Defense. Hệ thống cho phép sinh viên upload đồ án, quét source code, AI phân tích → sinh câu hỏi phản biện → vào phòng bảo vệ giả định (video call + timer) → hội đồng chấm điểm → xuất PDF "Bệnh án đồ án".

### Vấn đề của thiết kế cũ

| Vấn đề | Tác động |
|--------|----------|
| Flat structure (routers/services/models root) | ❌ God Service, khó maintain, khó test |
| Sync AI processing | ❌ Block HTTP request, timeout cho file lớn |
| Không AI Gateway | ❌ Hardcode provider, khó switch OpenAI ↔ Gemini |
| Không Queue | ❌ User phải chờ AI xong mới nhận response |
| Không RAG pipeline | ❌ Mất context, AI trả lời thiếu chính xác |
| Services lẫn lộn | ❌ document_parser, code_parser, AI logic chung 1 đống |

### Giải pháp thiết kế mới

| Giải pháp | Lợi ích |
|-----------|----------|
| **Vertical Slice Modules** | Mỗi domain (assessment, meeting, evaluation) độc lập hoàn toàn |
| **Async Queue (BullMQ + Redis)** | AI processing không block HTTP, user poll kết quả |
| **AI Gateway** | Abstraction layer, switch provider dễ dàng |
| **RAG Pipeline** | Embedding → Vector Store → Retrieve → Generate (chính xác hơn) |
| **Event Bus nội bộ** | Decouple modules, dễ mở rộng |
| **Repository Pattern** | DB abstraction, dễ switch SQL ↔ NoSQL sau này |

### Key Metrics Target

| Metric | Target |
|--------|--------|
| Upload → AI Response Time | < 30s (với async) |
| Đồng thời | 100 users (MVP), 10000 (scale) |
| Thời gian dev MVP | 3 tuần |
| Số module | 6 (independent) |

---

## 2. Architecture Overview

```
                    ┌──────────────────────────────────────────┐
                    │              Next.js Frontend              │
                    │  (React + Tanstack Query + Zustand)       │
                    │  Port :3000                               │
                    └──────┬──────────────┬────────────────────┘
                           │ REST/SSE      │ WebSocket
                           ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Backend (Python)                        │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                    API Gateway Layer                         │  │
│  │  /api/v1/assessment/*  /api/v1/meeting/*  /api/v1/report/* │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │Assessment│ │ Meeting  │ │Evaluation│ │  Report  │ │ Storage│ │
│  │ Module   │ │ Module   │ │ Module   │ │ Module   │ │ Module │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       │             │             │            │            │      │
│  ┌────┴─────────────┴─────────────┴────────────┴────────────┴──┐  │
│  │                    Shared Kernel                              │  │
│  │  AI Gateway │ Queue Client │ Repository │ Event Bus │ Config │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  PostgreSQL   │    │    Redis      │    │   MinIO S3   │
   │  (Primary DB) │    │ (Queue + Cache│    │  (File Store) │
   └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 3. Tech Stack Selection

### 3.1 Frontend: **Next.js 14 (App Router) + React 18**

| So sánh | Next.js | React+Vite | Nuxt | SvelteKit |
|---------|---------|------------|------|-----------|
| SSR/SSG | ✅ Built-in | ❌ Thêm setup | ✅ | ✅ |
| File-based routing | ✅ | ❌ React Router | ✅ | ✅ |
| API Routes | ✅ (cho BFF) | ❌ | ✅ | ✅ |
| Ecosystem | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Learning curve | Thấp (React) | Thấp | Trung bình | Trung bình |
| Team match | ✅ Team biết React | ✅ | ❌ | ❌ |

**Kết luận:** Next.js 14 — tận dụng App Router, Server Components cho performance, API Routes làm BFF nếu cần.

**UI Framework: Tailwind + shadcn/ui**
- Tailwind: utility-first, nhanh cho MVP, không conflict CSS
- shadcn/ui: copy-paste component, không phải dependency nặng, customize được
- ❌ MUI: quá nặng, khó custom
- ❌ Ant Design: không phù hợp MVP speed

**State Management: Tanstack Query + Zustand**
- **Tanstack Query**: cho server state (API calls, cache, refetch) — bắt buộc
- **Zustand**: cho client state (UI state, WebSocket state) — nhẹ hơn Redux 10x
- ❌ Redux: overkill cho team 3 người, boilerplate nhiều

**Validation: Zod + React Hook Form**
- Zod: type-safe validation, shared với backend nếu dùng TypeScript
- React Hook Form: performant form handling

### 3.2 Backend: **Python FastAPI**

| So sánh | FastAPI | NestJS | Fastify/Express | Spring Boot |
|---------|---------|--------|-----------------|-------------|
| Async | ✅ Native | ✅ | ✅ | ❌ Thread-based |
| AI Ecosystem | ✅ Python (OpenAI, LangChain, etc) | ❌ Node.js weak for AI | ❌ | ❌ |
| Performance | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Auto Docs | ✅ Swagger/ReDoc | ✅ | ❌ Thêm plugin | ✅ |
| Learning curve | Thấp | Trung bình | Thấp | Cao |
| MVP Speed | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Future microservice | ✅ Dễ | ✅ Dễ | ✅ Dễ | ✅ |

**Kết luận:** **FastAPI** — lý do chính: AI ecosystem Python là không thể thay thế. FastAPI async-first, auto Swagger, performance ngang Node.js.

### 3.3 Database: **PostgreSQL**

| So sánh | PostgreSQL | MySQL | MongoDB | SQLite |
|---------|-----------|-------|---------|--------|
| JSONB | ✅ | ❌ | ✅ (native) | ❌ |
| Full-text search | ✅ | ✅ | ❌ | ❌ |
| pgvector | ✅ (AI feature) | ❌ | ❌ | ❌ |
| ACID | ✅ | ✅ | ⚠️ | ✅ |
| Scaling | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ |
| Maturity | 30+ năm | 25+ năm | 15+ năm | 20+ năm |

**Kết luận:** **PostgreSQL** — JSONB cho flexible data, pgvector cho AI feature sau này, full-text search cho document content.

**ORM: SQLAlchemy 2.0 + Alembic**
- SQLAlchemy: Python ORM mạnh nhất, async support, repository pattern dễ implement
- Alembic: migration tool built-in
- ❌ Prisma/Drizzle: tốt nhưng Python backend cần Python ORM

### 3.4 Storage: **MinIO (S3-compatible)**

| So sánh | MinIO | AWS S3 | Cloudflare R2 | Local |
|---------|-------|--------|---------------|-------|
| MVP Cost | ✅ Free | ❌ Pay | ✅ Free tier | ✅ Free |
| S3-compatible | ✅ | ✅ | ✅ | ❌ |
| Self-host | ✅ Docker | ❌ | ❌ | ✅ |
| Scale | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ |
| Setup time | 5 phút | 10 phút | 10 phút | 0 phút |

**Kết luận MVP:** **Local disk** (MVP 3 tuần, không cần S3).  
**Kiến trúc code:** Dùng abstraction `StorageProvider` — chuyển sang MinIO/R2 sau 1 dòng config.

### 3.5 Queue: **Redis + BullMQ (Node.js worker) / ARQ (Python)**

**Vấn đề:** AI processing có thể mất 10-30s. Nếu xử lý sync trong HTTP request:
- User phải chờ
- Timeout (heroku/render timeout 30s)
- Không retry nếu lỗi

**So sánh Queue:**

| Queue | Ngôn ngữ | MVP Setup | Use case |
|-------|----------|-----------|----------|
| **BullMQ** | Node.js | ✅ Dễ | AI processing, PDF gen |
| RabbitMQ | Generic | ❌ Cần setup | Enterprise |
| Kafka | Generic | ❌ Nặng | Event streaming |
| Redis Queue (ARQ) | Python | ✅ Dễ | AI processing |
| Không Queue | — | ✅ Nhanh | ⚠️ Block request |

**Kết luận MVP:** **ARQ (Python)** hoặc **BullMQ (Node.js worker)** — tôi chọn **BullMQ với Node.js worker** vì:
1. Redis đã cần cho cache + session
2. BullMQ là queue tốt nhất cho Node.js ecosystem
3. Frontend team có thể viết worker nếu cần
4. Tuy nhiên, **cho MVP 3 tuần**: **Không Queue**. Lý do:
   - AI processing sync nhưng có timeout + loading state
   - Thêm queue = thêm complexity (Redis, worker, error handling)
   - Với 100 users concurrent, FastAPI async handle được
   - Queue sẽ thêm ở Phase 2 (tháng 2)

**Quyết định MVP:** **Polling pattern** — Client gọi API → Backend trả về `job_id` → Client poll `/api/jobs/{id}` → Backend xử lý async với `asyncio.create_task` hoặc `BackgroundTasks`.

### 3.6 Cache: **Redis**

| Cache | Use case | MVP cần? |
|-------|----------|----------|
| Prompt Cache | Lưu prompt template | ✅ Có (lưu trong code) |
| AI Response Cache | Cache kết quả AI (cùng file + persona) | ✅ **Quan trọng** |
| Session Cache | Room state real-time | ✅ WebSocket |
| File Metadata Cache | Giảm DB query | ⚠️ Optional |

**Kết luận MVP:** **Không Redis** — MVP dùng in-memory cache đơn giản (Python dict / LRU).  
Redis sẽ thêm ở Phase 2 khi cần multi-instance.

```python
# MVP-level cache (in-memory)
from functools import lru_cache

@lru_cache(maxsize=128)
def get_cached_ai_result(document_hash: str, persona: str):
    ...
```

### 3.7 Realtime: **WebSocket (FastAPI native) + SSE cho progress**

| Công nghệ | Use case | MVP? |
|-----------|----------|------|
| **FastAPI WebSocket** | Room state, timer, roles | ✅ |
| **SSE (Server-Sent Events)** | AI progress updates | ✅ |
| Socket.IO | Fallback cho WebSocket | ❌ (dư thừa) |
| LiveKit/WebRTC | Video call | ✅ Tuần 2 |

**Quyết định:**
- **Phòng họp + timer**: WebSocket — bidirectional cần thiết
- **AI Processing progress**: SSE — 1 chiều từ server → client, đơn giản hơn WebSocket
- **Video Call**: Jitsi Meet API (third-party iframe)

### 3.8 Video Call: **Jitsi Meet API** (free, self-host option)

| So sánh | Jitsi | LiveKit | Daily | Agora |
|---------|-------|---------|-------|-------|
| Free | ✅ | ⚠️ (limited) | ❌ | ❌ |
| Self-host | ✅ Docker | ✅ | ❌ | ❌ |
| Integration | iframe API | SDK | SDK | SDK |
| Quality | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| MVP Speed | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |

**Kết luận:** **Jitsi Meet API** — free, iframe embed trong 5 phút, đủ cho MVP.

### 3.9 PDF Generation: **React-PDF** (server-side) + **jsPDF** (client fallback)

| So sánh | React-PDF | Puppeteer | jsPDF | PDFKit |
|---------|-----------|-----------|-------|--------|
| Server-side | ✅ | ✅ | ❌ | ⚠️ |
| Client-side | ✅ | ❌ | ✅ | ❌ |
| Complex layout | ✅ | ✅ | ⚠️ | ⚠️ |
| Performance | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

**Kết luận MVP:** **React-PDF** — render PDF từ React component, có thể dùng cả client và server.

### 3.10 Chart: **recharts** (React-native, dùng với Tailwind)

| So sánh | recharts | Chart.js | D3.js | Nivo |
|---------|----------|----------|-------|------|
| React-native | ✅ | ❌ (wrapper) | ❌ | ✅ |
| Radar Chart | ✅ | ✅ | ✅ | ✅ |
| TypeScript | ✅ | ❌ | ❌ | ✅ |
| Bundle size | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

**Kết luận:** **recharts** — React-native, dễ dùng, radar chart có sẵn.

### 3.11 Deployment: **Docker Compose → Railway/Fly.io**

| So sánh | Docker Compose | Railway | Render | Fly.io | K8s |
|---------|---------------|---------|--------|--------|-----|
| MVP Setup | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Cost MVP | Free | $5-20 | $7-25 | $10-30 | $50+ |
| Scale | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**Kết luận MVP:** **Docker Compose** cho local dev → **Railway** cho staging/production MVP.  
Railway có free PostgreSQL, Dockerfile deploy, và domain .railway.app.

---

## 4. Module Design (Vertical Slices)

### 4.1 Module Architecture

```
backend/
├── modules/
│   ├── assessment/          # Upload + Parse + AI Generate Questions
│   │   ├── api/
│   │   │   ├── routes.py
│   │   │   └── schemas.py
│   │   ├── domain/
│   │   │   ├── entities.py
│   │   │   ├── value_objects.py
│   │   │   └── events.py
│   │   ├── service/
│   │   │   ├── document_service.py
│   │   │   ├── parser_service.py
│   │   │   └── question_service.py
│   │   ├── infrastructure/
│   │   │   ├── repository.py
│   │   │   ├── parser.py
│   │   │   └── ai_pipeline.py
│   │   └── tests/
│   │
│   ├── code_analysis/       # Source Code Scanning
│   │   ├── api/
│   │   ├── domain/
│   │   ├── service/
│   │   └── infrastructure/
│   │
│   ├── meeting/             # Mock Defense Room
│   │   ├── api/
│   │   ├── domain/
│   │   ├── service/
│   │   └── infrastructure/
│   │
│   ├── evaluation/          # Scoring + Rubric
│   │   ├── api/
│   │   ├── domain/
│   │   ├── service/
│   │   └── infrastructure/
│   │
│   ├── report/              # PDF Generation + Radar
│   │   ├── api/
│   │   ├── domain/
│   │   ├── service/
│   │   └── infrastructure/
│   │
│   └── storage/             # File upload/download
│       ├── api/
│       ├── domain/
│       ├── service/
│       └── infrastructure/
│
├── shared/                  # Shared Kernel
│   ├── ai/                  # AI Gateway
│   │   ├── gateway.py       # Abstract base class
│   │   ├── openai_provider.py
│   │   ├── gemini_provider.py
│   │   ├── prompts/         # Prompt templates
│   │   │   ├── personas/
│   │   │   ├── code_review/
│   │   │   └── evaluation/
│   │   └── embeddings/
│   ├── queue/               # Queue abstraction
│   ├── cache/               # Cache abstraction
│   ├── database/            # DB connection + repository base
│   ├── event/              # Event bus
│   ├── config/             # App config
│   └── utils/              # Helpers (strictly limited)
│
├── main.py
├── core.py                  # DI container, lifespan
└── config.py
```

### 4.2 Module Responsibilities

| Module | Responsibility | Key Files | Owner |
|--------|---------------|-----------|-------|
| **assessment** | Upload file, parse document, AI generate questions | `document_service`, `parser_service`, `question_service` | Quý |
| **code_analysis** | Upload source code, parse AST, AI scan code | `code_service`, `ast_parser`, `code_review_service` | Quý + Dev C |
| **meeting** | Room CRUD, Jitsi integration, Timer, Roles, WebSocket | `room_service`, `timer_service`, `ws_handler` | Dev C + A |
| **evaluation** | Score CRUD, Rubric management, average calculation | `score_service`, `rubric_service` | Dev C |
| **report** | PDF generation, Radar chart data, AI feedback summary | `pdf_service`, `report_generator`, `ai_feedback` | Quý + Dev A |
| **storage** | File upload/download to disk/S3 | `file_service`, `storage_provider` | Dev C |

### 4.3 Module Independence

```
assessment → (storage) → code_analysis
     ↓                          ↓
  meeting → (evaluation) → report
```

Mỗi module:
- ✅ Có API riêng (routes.py + schemas.py)
- ✅ Có domain logic riêng (entities, service)
- ✅ Có database access riêng (repository)
- ✅ Không gọi trực tiếp module khác
- ✅ Giao tiếp qua event bus hoặc shared kernel
- ✅ Có thể test độc lập

---

## 5. AI Architecture

### 5.1 AI Gateway — Abstraction Layer

```python
# shared/ai/gateway.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class AIRequest:
    prompt: str
    system_prompt: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2000
    response_format: str = "json"  # json | text

@dataclass
class AIResponse:
    content: str
    usage: dict
    latency_ms: int
    provider: str

class AIGateway(ABC):
    """Abstract AI Gateway — switch provider without changing business logic"""
    
    @abstractmethod
    async def generate(self, request: AIRequest) -> AIResponse:
        ...
    
    @abstractmethod
    async def chat(self, messages: list, request: AIRequest) -> AIResponse:
        ...

# shared/ai/openai_provider.py
class OpenAIProvider(AIGateway):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
    
    async def generate(self, request: AIRequest) -> AIResponse:
        start = time.time()
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": request.prompt}],
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            response_format={"type": "json_object"} if request.response_format == "json" else None
        )
        return AIResponse(
            content=response.choices[0].message.content,
            usage=response.usage.model_dump(),
            latency_ms=int((time.time() - start) * 1000),
            provider="openai"
        )

# shared/ai/prompts/
#   ├── personas/
#   │   ├── theory_professor.py    # "Bạn là giáo sư đại học..."
#   │   ├── enterprise_reviewer.py # "Bạn là chuyên gia doanh nghiệp..."
#   │   └── strict_examiner.py     # "Bạn là hội đồng khó tính..."
#   ├── code_review/
#   │   └── review.py              # "Phân tích source code sau..."
#   └── evaluation/
#       └── feedback.py            # "Tổng hợp điểm yếu từ..."
```

### 5.2 RAG Pipeline

```
    Upload Document
         ↓
    Parse Text (PyPDF2/python-docx/python-pptx)
         ↓
    Chunk Text (by paragraph/section, max 1000 tokens)
         ↓
    Embedding (OpenAI Embedding API)
         ↓
    Vector Store (pgvector / in-memory cho MVP)
         ↓
    User selects Persona
         ↓
    Retrieve relevant chunks (Top-K = 5)
         ↓
    Build Prompt: [System Prompt (Persona)] + [Retrieved Chunks] + [Instruction]
         ↓
    LLM Generate (OpenAI/Gemini)
         ↓
    Structured Output → Parser → JSON Response
         ↓
    Save to Database + Return to Frontend
```

**MVP Decision:** Không dùng pgvector cho MVP. Thay bằng:
- Parse full text → chunk by `\n\n` (paragraph)
- Lưu chunks trong JSONB field của `assessments` table
- Retrieval = gửi toàn bộ relevant chunks (max 5000 tokens) vào prompt
- Đủ cho MVP vì tài liệu sinh viên thường < 50 trang

**Code implementation:**
```python
# modules/assessment/infrastructure/ai_pipeline.py
class AssessmentPipeline:
    def __init__(self, ai_gateway: AIGateway):
        self.ai = ai_gateway
    
    async def run(self, document_text: str, persona: str) -> list[Question]:
        # 1. Chunk
        chunks = self._chunk_text(document_text, max_tokens=1000)
        
        # 2. Build prompt with chunks + persona
        prompt = self._build_prompt(chunks, persona)
        
        # 3. Call AI
        response = await self.ai.generate(AIRequest(
            prompt=prompt,
            system_prompt=self._get_system_prompt(persona),
            response_format="json"
        ))
        
        # 4. Parse structured output
        return self._parse_questions(response.content)
    
    def _chunk_text(self, text: str, max_tokens: int) -> list[str]:
        # Simple paragraph-based chunking
        paragraphs = text.split('\n\n')
        chunks = []
        current = ""
        for p in paragraphs:
            if len(current) + len(p) < max_tokens * 4:  # rough char estimate
                current += p + "\n\n"
            else:
                chunks.append(current)
                current = p + "\n\n"
        if current:
            chunks.append(current)
        return chunks[:10]  # Max 10 chunks for MVP
```

### 5.3 Source Code Analysis Pipeline

```
    Upload .zip → Save to Storage
         ↓
    Extract Zip → Get file tree
         ↓
    Filter relevant files (.py/.js/.ts/.java/.cs/.cpp/.html/.css)
         ↓    (skip: node_modules/, .git/, dist/, build/, package-lock.json)
    Read file content
         ↓
    Build AST summary (function names, class names, imports)
         ↓
    Chunk code files (max 5 files per chunk, max 2000 lines per chunk)
         ↓
    AI Analyze each chunk
         ↓
    Aggregate results
         ↓
    Return issues + suggestions
```

**MVP Decision:** Không cần AST parsing thực sự. Dùng regex + AI để phân tích.  
AST thật (tree-sitter) sẽ thêm ở Phase 2.

---

## 6. Database Design

### 6.1 Entity Relationship

```
┌──────────────┐       ┌──────────────────┐
│  documents   │       │  assessments      │
│──────────────│       │──────────────────│
│ id (PK)      │──1:1──│ id (PK)          │
│ filename     │       │ document_id (FK)  │
│ file_path    │       │ status            │
│ file_type    │       │ persona           │
│ doc_type     │       │ chunks (JSONB)    │
│ file_size    │       │ questions (JSONB) │
│ content_hash │       │ created_at        │
│ created_at   │       └──────────────────┘
└──────┬───────┘
       │
       │ 1:N
       │
┌──────┴───────┐       ┌──────────────────┐
│ code_analyses │       │  meetings        │
│──────────────│       │──────────────────│
│ id (PK)      │       │ id (PK)          │
│ document_id  │       │ name             │
│ status       │       │ status           │
│ issues (JSONB)│      │ phase            │
│ summary (TEXT)│      │ timer_seconds    │
│ suggestions  │       │ created_at       │
│ pass_rate    │       └────────┬─────────┘
│ created_at   │                │
└──────────────┘                │ 1:N
                                │
          ┌─────────────────────┴──────────────┐
          │  meeting_members                   │
          │───────────────────────────────────│
          │ id (PK)                           │
          │ meeting_id (FK)                   │
          │ name (string, no auth)            │
          │ role (chair/secretary/member/student)│
          │ joined_at                         │
          └────────────────────────────────────┘
          
          ┌──────────────────────┐       ┌──────────────────┐
          │  evaluations         │       │     reports      │
          │──────────────────────│       │──────────────────│
          │ id (PK)              │──1:1──│ id (PK)          │
          │ meeting_id (FK)      │       │ evaluation_id(FK)│
          │ reviewer_name        │       │ ai_feedback(TEXT)│
          │ knowledge_score (1-10)│      │ weaknesses (JSONB)│
          │ presentation_score   │       │ radar_data (JSONB)│
          │ reflex_score         │       │ pdf_path         │
          │ code_quality_score   │       │ pass_rate        │
          │ overall_comment(TEXT)│       │ created_at       │
          │ created_at           │       └──────────────────┘
          └──────────────────────┘
```

### 6.2 JSONB Usage Strategy

| Table | JSONB Field | Content | Why JSONB? |
|-------|-------------|---------|------------|
| `assessments` | `chunks` | Mảng các chunk text đã parse | Flexible, không cần table riêng cho chunks |
| `assessments` | `questions` | Mảng 10 câu hỏi + gợi ý | AI output format thay đổi theo prompt |
| `code_analyses` | `issues` | Mảng các lỗi + severity | Số lượng lỗi không cố định |
| `evaluations` | `radar_data` | Điểm từng tiêu chí | Có thể thêm tiêu chí sau này |
| `reports` | `weaknesses` | Danh sách điểm yếu | AI-generated, format flexible |

### 6.3 Indexing Strategy

```sql
-- Bắt buộc
CREATE INDEX idx_documents_doc_type ON documents(doc_type);
CREATE INDEX idx_documents_content_hash ON documents(content_hash);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_evaluations_meeting_id ON evaluations(meeting_id);

-- Cho full-text search sau này
-- CREATE INDEX idx_assessments_chunks_gin ON assessments USING GIN (chunks);
```

---

## 7. Event-Driven Architecture

### 7.1 Event Bus (In-memory cho MVP)

```python
# shared/event/bus.py
from dataclasses import dataclass
from typing import Callable, Awaitable
import asyncio

@dataclass
class Event:
    name: str
    data: dict

class EventBus:
    def __init__(self):
        self._handlers: dict[str, list[Callable]] = {}
    
    def subscribe(self, event_name: str, handler: Callable):
        if event_name not in self._handlers:
            self._handlers[event_name] = []
        self._handlers[event_name].append(handler)
    
    async def publish(self, event: Event):
        handlers = self._handlers.get(event.name, [])
        for handler in handlers:
            asyncio.create_task(handler(event))  # fire-and-forget

# Usage
bus = EventBus()

# After assessment is complete → notify meeting module
bus.subscribe("assessment.completed", lambda e: notify_meeting_module(e.data))

# After meeting ends → trigger evaluation
bus.subscribe("meeting.ended", lambda e: trigger_evaluation(e.data))

# After evaluation is done → trigger report generation
bus.subscribe("evaluation.completed", lambda e: trigger_report(e.data))
```

### 7.2 Key Events

| Event Name | Publisher | Subscriber | Data |
|-----------|-----------|------------|------|
| `document.uploaded` | storage module | assessment module | `{document_id, file_path}` |
| `assessment.completed` | assessment module | notification (future) | `{document_id, question_count}` |
| `code_analysis.completed` | code_analysis module | notification | `{document_id, issue_count}` |
| `meeting.created` | meeting module | — | `{meeting_id, name}` |
| `meeting.phase_changed` | meeting module | WebSocket broadcast | `{meeting_id, phase}` |
| `meeting.ended` | meeting module | evaluation module | `{meeting_id}` |
| `evaluation.completed` | evaluation module | report module | `{evaluation_id}` |
| `report.generated` | report module | notification | `{report_id, pdf_path}` |

---

## 8. Async Processing Strategy

### 8.1 AI Processing Flow (Polling Pattern)

```python
# modules/assessment/api/routes.py
from fastapi import APIRouter, BackgroundTasks
from modules.assessment.service.question_service import QuestionService
from shared.queue.job_manager import JobManager

router = APIRouter(prefix="/api/v1/assessment")

@router.post("/generate-questions")
async def generate_questions(document_id: int, persona: str, background_tasks: BackgroundTasks):
    """
    1. Validate input
    2. Return job_id immediately
    3. Process AI in background
    4. Client polls /api/jobs/{job_id}
    """
    job_id = str(uuid.uuid4())
    JobManager.create(job_id, status="processing")
    
    background_tasks.add_task(
        QuestionService.generate_async,
        document_id=document_id,
        persona=persona,
        job_id=job_id
    )
    
    return {"job_id": job_id, "status": "processing"}

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Client poll endpoint"""
    job = JobManager.get(job_id)
    if job.status == "completed":
        return {"status": "completed", "result": job.result}
    elif job.status == "failed":
        return {"status": "failed", "error": job.error}
    return {"status": "processing"}


# modules/assessment/service/question_service.py
class QuestionService:
    @staticmethod
    async def generate_async(document_id: int, persona: str, job_id: str):
        try:
            # 1. Get document from storage
            doc = await document_repo.get_by_id(document_id)
            
            # 2. Parse document
            text = await parser_service.parse(doc.file_path)
            
            # 3. Run AI pipeline
            questions = await ai_pipeline.run(text, persona)
            
            # 4. Save to database
            assessment = await assessment_repo.save(document_id, persona, questions)
            
            # 5. Update job result
            JobManager.complete(job_id, result=assessment.to_dict())
            
            # 6. Publish event
            await event_bus.publish(Event("assessment.completed", {
                "document_id": document_id,
                "assessment_id": assessment.id,
                "question_count": len(questions)
            }))
            
        except Exception as e:
            JobManager.fail(job_id, error=str(e))
```

### 8.2 Frontend Polling

```typescript
// hooks/useAssessment.ts
import { useQuery } from '@tanstack/react-query'

function useGenerateQuestions(documentId: number, persona: string) {
  const [jobId, setJobId] = useState<string | null>(null)

  const startGeneration = async () => {
    const { job_id } = await api.post('/api/v1/assessment/generate-questions', {
      document_id: documentId,
      persona
    })
    setJobId(job_id)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.get(`/api/v1/assessment/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (data) => 
      data?.status === 'completed' ? false : 2000, // poll every 2s
  })

  return { startGeneration, result: data?.result, isLoading }
}
```

---

## 9. Folder Structure (Final)

### 9.1 Root Structure

```
DefendAI/
├── apps/
│   ├── web/                    # Next.js Frontend
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   ├── components/     # UI components
│   │   │   │   ├── ui/         # shadcn/ui components
│   │   │   │   ├── features/   # Feature-specific components
│   │   │   │   │   ├── assessment/
│   │   │   │   │   ├── code-review/
│   │   │   │   │   ├── meeting/
│   │   │   │   │   └── report/
│   │   │   │   └── layout/     # Layout components
│   │   │   ├── hooks/          # React hooks (useAI, useWebSocket...)
│   │   │   ├── lib/            # API client, utils
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── types/          # TypeScript types
│   │   │   └── config/         # App config
│   │   ├── public/
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── api/                    # FastAPI Backend
│       ├── modules/            # Vertical Slice Modules
│       │   ├── assessment/
│       │   │   ├── api/        # routes.py, schemas.py
│       │   │   ├── domain/     # entities.py, value_objects.py
│       │   │   ├── service/    # business logic
│       │   │   └── tests/
│       │   ├── code_analysis/
│       │   ├── meeting/
│       │   ├── evaluation/
│       │   ├── report/
│       │   └── storage/
│       │
│       ├── shared/             # Shared Kernel
│       │   ├── ai/             # AI Gateway
│       │   │   ├── gateway.py
│       │   │   ├── openai_provider.py
│       │   │   ├── gemini_provider.py
│       │   │   └── prompts/
│       │   ├── database/
│       │   │   ├── base.py     # SQLAlchemy Base
│       │   │   ├── session.py  # DB Session
│       │   │   └── repository.py  # Base Repository
│       │   ├── event/          # Event Bus
│       │   ├── config/         # Settings
│       │   └── utils/          # Minimal helpers
│       │
│       ├── main.py             # FastAPI app
│       ├── container.py        # DI container
│       ├── config.py           # App settings
│       ├── requirements.txt
│       └── Dockerfile
│
├── docker-compose.yml          # PostgreSQL + MinIO + API + Web
├── .gitignore
├── MVP_PLAN.md
├── README.md
└── docs/
    ├── ARCHITECTURE.md
    ├── REQUIREMENT.md
    └── FUNCTIONS.md
```

### 9.2 Naming Conventions

| Layer | File | Convention |
|-------|------|------------|
| Module routes | `routes.py` | `/{module}/api/routes.py` |
| Module schemas | `schemas.py` | `/{module}/api/schemas.py` |
| Module entities | `entities.py` | `/{module}/domain/entities.py` |
| Module service | `*_service.py` | `/{module}/service/*_service.py` |
| Module tests | `test_*.py` | `/{module}/tests/test_*.py` |
| Repository | `*_repository.py` | `/{module}/infrastructure/*_repository.py` |

---

## 10. Security Preparation (Future Auth)

Mặc dù MVP chưa cần Auth, thiết kế đã chuẩn bị:

```python
# shared/auth/ (sẽ thêm sau MVP)
# ├── jwt.py          # JWT encode/decode
# ├── rbac.py         # Role-based access control
# ├── workspace.py    # Workspace isolation
# └── permissions.py  # Permission decorators

# Các module đã có sẵn chỗ cho auth:
# modules/assessment/api/routes.py
@router.post("/generate-questions")
# @requires_auth  # Chỉ cần uncomment sau này
# @requires_role(["student"])
async def generate_questions(...):
    ...

# Workspace isolation đã có trong query:
class BaseRepository:
    async def find_by_id(self, id: int, workspace_id: int | None = None):
        query = select(self.model).where(self.model.id == id)
        if workspace_id and hasattr(self.model, 'workspace_id'):
            query = query.where(self.model.workspace_id == workspace_id)
        ...
```

---

## 11. Scalability Plan

### 11.1 100 Users (MVP)

| Thành phần | Config | Cost/tháng |
|-----------|--------|------------|
| Frontend | Next.js (Railway free) | $0 |
| Backend | FastAPI 1 instance (Railway $5) | $5 |
| Database | PostgreSQL (Railway free 1GB) | $0 |
| File storage | Local disk | $0 |
| AI API | OpenAI GPT-4o (pay-per-use) | $20-50 |
| **Total** | | **$25-55** |

**Architecture:** Monolith Docker Compose — 1 process chạy tất cả.

### 11.2 1000 Users

| Thay đổi | Lý do |
|----------|-------|
| Thêm Redis cache | Giảm 50% AI calls (cache trùng document + persona) |
| Thêm Queue (BullMQ) | AI processing không block HTTP |
| Stateless backend → horizontal scale | Thêm 1-2 instance |
| Database connection pool tuning | Tăng max_connections |
| **Total** | **$100-200/tháng** |

### 11.3 10000 Users

| Thay đổi | Lý do |
|----------|-------|
| Tách AI thành microservice riêng | Module đầu tiên cần scale độc lập |
| Thêm pgvector | RAG cần vector search |
| Thêm CDN cho file storage | File access pattern |
| Read replicas cho PostgreSQL | Query load |
| **Module tách đầu tiên:** | **AI Service** (vì CPU/GPU intensive) |

### 11.4 Module tách Microservice (Priority Order)

```
1. AI Service (tách đầu tiên)  — CPU/GPU intensive, cần scale riêng
2. Storage Service              — File I/O intensive
3. Meeting Service              — WebSocket real-time
4. Report Service               — PDF generation (CPU)
5. Assessment Service           — Giữ nguyên lâu nhất
```

---

## 12. Trade-off Analysis

| Decision | Pros | Cons | MVP Decision |
|----------|------|------|--------------|
| **Sync AI** (no queue) | ✅ Đơn giản, không cần Redis | ❌ User chờ, timeout risk | ✅ **Chọn** (với polling pattern) |
| **No Auth** | ✅ Tiết kiệm 30% thời gian | ❌ Không track được user | ✅ **Chọn** |
| **ng dùng RAG** | ✅ Câu trả lời chính xác hơn | ❌ Complexity cao hơn | ⚠️ **RAG đơn giản** (chunk + prompt, không vector DB) |
| **JSONB instead of separate tables** | ✅ Flexible, AI output thay đổi được | ❌ Không query được deep | ✅ **Chọn** (cho MVP) |
| **Vertical Slice over Flat structure** | ✅ Dễ maintain, dễ test | ❌ Hơi nhiều folder | ✅ **Chọn** |
| **Jitsi over LiveKit** | ✅ Free, 5 phút tích hợp | ❌ Quality trung bình | ✅ **Chọn** |
| **React-PDF over Puppeteer** | ✅ Nhẹ, không cần Chromium | ❌ Complex layout khó | ✅ **Chọn** |
| **In-memory cache over Redis** | ✅ Không cần service phụ | ❌ Mất cache khi restart | ✅ **Chọn** (cho MVP) |

---

## 13. Development Timeline (3 tuần)

### Tuần 1: Foundation + AI Pipeline

```
Quý: AI Gateway → Document Parser → Code Parser → Question Service → Code Review Service
Dev A: Next.js setup → UI Kit → Upload Page → Question List UI → Code Review UI
Dev C: Database schema → Storage module → Upload API → WebSocket setup → Meeting API
```

### Tuần 2: Meeting Module

```
Quý: AI Real-time suggestions → Session Report API → Support integration
Dev A: Mock Room Layout → Timer UI → Video Call (Jitsi) → Role selection UI
Dev C: Meeting WebSocket → Room CRUD API → Timer logic → Role management
```

### Tuần 3: Evaluation + Report + Polish

```
Quý: AI Feedback summary → "Bệnh án đồ án" review → Prompt tuning
Dev A: Score form → Radar Chart → Report page → PDF Export → Polish
Dev C: Score API → Evaluation API → Report API → Integration → Deploy
```

---

## 14. Future Migration Path

```
MVP (3 tuần)                        Phase 2 (Tháng 2)                  Phase 3 (Tháng 3+)
┌──────────────────┐              ┌──────────────────┐              ┌────────────────────┐
│ Monolith         │  ──────▶     │ Monolith + Redis │  ──────▶     │ AI Microservice    │
│ FastAPI          │              │ + Queue (BullMQ) │              │ + Event Sourcing   │
│ PostgreSQL       │              │ + Auth (JWT)     │              │ + RAG (pgvector)   │
│ Local Storage    │              │ + MinIO/S3       │              │ + Multi-provider   │
│ No Auth          │              │ + Rate Limiting  │              │ + B2B Workspace    │
│ No Queue         │              │ + Cache          │              │ + Payment          │
│                  │              │                  │              │                    │
│ 19 functions     │              │ + Payment Module │              │ + Admin Dashboard  │
│ 3 developers     │              │ + Auth Module    │              │ + Analytics        │
└──────────────────┘              └──────────────────┘              └────────────────────┘
```

---

## 15. Final Recommendation

1. **Tech Stack:** Next.js + FastAPI + PostgreSQL + Jitsi — đã tối ưu cho MVP
2. **Architecture:** Vertical Slice Modules — clean, maintainable, testable
3. **AI Gateway:** Abstraction layer — dễ switch provider, dễ test
4. **Async:** Polling pattern — không Queue cho MVP, nhưng sẵn sàng thêm sau
5. **No Auth:** Tiết kiệm 30% thời gian — tập trung hoàn toàn vào main functions
6. **RAG đơn giản:** Chunk + Prompt — đủ cho MVP, không cần vector DB
7. **Priorities:** Main Function > Performance > Security > Everything Else

**Công thức thành công:**
> "Làm đúng ngay từ đầu (clean architecture) + Cắt đúng scope (no auth, no queue, no over-engineering) = MVP 3 tuần khả thi."

---

*© 2026 DefendAI — Architecture Design Document v2.0*