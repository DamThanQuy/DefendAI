# DefendAI — Architecture Document

## Overview

DefendAI là hệ thống AI-powered project defense assistant cho sinh viên kỹ thuật. Hệ thống giúp:

1. **Đọc & phân tích tài liệu** (DOCX với diagram)
2. **Review source code** từ ZIP/RAR
3. **Sinh câu hỏi phản biện** dựa trên rubric SEP490
4. **Mock defense room** với adaptive questioning

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                       │
│  /documents  /code-review  /questions  /room  /report           │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP / WebSocket
┌─────────────────────────▼───────────────────────────────────────┐
│                      Backend API (FastAPI)                      │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │Documents │  │ CodeScan  │  │ Questions │  │ MockQA      │  │
│  │Router    │  │ Router    │  │ Router    │  │ Router      │  │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘  │
│       │              │              │                │          │
│  ┌────▼──────────────▼──────────────▼────────────────▼──────┐  │
│  │                   Services Layer                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │Parser    │  │Scanner   │  │Generator │  │Adaptive  │ │  │
│  │  │(DOCX)    │  │(ZIP)     │  │(Questions)│ │(Difficulty)│ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │  │
│  │  │Circuit   │  │Fallback  │  │CLO       │  │Summary   │ │  │
│  │  │Breaker   │  │Reviewer  │  │Tracker   │  │Service   │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                   │
│  ┌─────────────────────────▼────────────────────────────────┐  │
│  │                    AI Gateway                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │  │
│  │  │ NVIDIA NIM   │  │  Local/LM    │  │  Gemini Embed │  │  │
│  │  │ (Step-3.7)   │  │  Studio      │  │  (dim=1024)   │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐      ┌──────────┐      ┌──────────┐
   │ Postgres │     │  Redis   │      │  MinIO   │
   │ + pgvector│    │ (job queue)│     │ (files)  │
   └─────────┘      └──────────┘      └──────────┘
```

---

## Key Components

### 1. Document Parser (`services/document_parser.py`)
- Parses DOCX files using `python-docx`
- Extracts text + images (diagrams) from `word/media/`
- Chunks text for RAG retrieval
- Hook: `parse_chunk_index` for embedding auto-indexing

### 2. Code Scanner (`services/code_scanner.py`)
- Reads ZIP/RAR from MinIO
- Classifies: `pass` | `ambiguous` | `reject`
- Map-Reduce: splits into modules (≤40 files each)
- Each module → 1 LLM call → issues aggregated

### 3. Question Generator (`handlers/questions.py`)
- Async job queue (Redis BLPOP)
- Multi-chunk parallel generation (3 chunks per call)
- Anti-hallucination: strict prompt with rubric injection
- Fallback: teacher-doc detection + heuristic templates

### 4. Circuit Breaker (`services/circuit_breaker.py`)
- Protects against cascading AI failures
- States: CLOSED → OPEN → HALF_OPEN → CLOSED
- Per-service instances: `code_review_breaker`, `question_gen_breaker`

### 5. Fallback Reviewer (`services/code_review_fallback.py`)
- Pattern-based heuristic scan (regex)
- Predefined comments per category (security, performance, style)
- Used when circuit breaker is OPEN

### 6. CLO Tracker (`services/clo_tracker.py`)
- Tracks 7 CLOs from SEP490 rubric
- Records: correct / partial / incorrect answers
- Computes accuracy rate, coverage, quality distribution

### 7. Mock QA Engine (`services/mock_qa.py`)
- State machine: IDLE → ACTIVE → FINISHED
- Adaptive difficulty based on CLO coverage
- WebSocket support planned for real-time Q&A

---

## Data Flow

### Code Review Flow
```
User uploads ZIP → POST /api/code/scan
  → Creates CodeAnalysis (status=queued)
  → Enqueue job "code_scan_async"
  → Worker: classify → extract → heuristic pass-1 → split modules
  → Enqueue N jobs "code_scan_module" (parallel)
  → Each module: circuit breaker → AI review OR fallback
  → Aggregate issues → POST /api/code/analyses/{id} (poll)
```

### Question Generation Flow
```
User requests questions → POST /api/questions/generate
  → Creates Assessment (status=processing)
  → Enqueue job "generate_questions"
  → Worker: parse & chunk → index chunks → load rubric
  → Parallel AI calls (3 chunks each) through circuit breaker
  → Merge + normalize questions → save Assessment
  → Poll GET /api/jobs/{job_id} for progress
```

---

## Configuration

All config via `.env` (see `core/config.py`):

```bash
# AI Providers
NVIDIA_API_KEY=...
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=stepfun-ai/Step-3.7-Flash

LOCAL_API_KEY=...
LOCAL_BASE_URL=http://localhost:20128
LOCAL_MODEL=...

GOOGLE_EMBED_API_KEY=...

# Redis
REDIS_URL=redis://localhost:6379/0

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/defense_db

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=60
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React, Tailwind CSS, TypeScript |
| Backend | FastAPI, Python 3.11+, SQLAlchemy async |
| Database | PostgreSQL 15 + pgvector (HNSW index) |
| Cache/Queue | Redis 7 (job queue, session store) |
| Storage | MinIO (S3-compatible, for DOCX/ZIP files) |
| AI | NVIDIA NIM, Google AI Studio, Local (Ollama/LM Studio) |
| Embeddings | Google Gemini (dim 1024) |
| RAG | Hybrid search (pgvector HNSW + BM25 + RRF fusion) |
