# 🔄 FLOW.md — Business Flows

> Mô tả toàn bộ luồng nghiệp vụ của DefendAI.

---

## 1. Main Flow: Upload → AI Assessment

```
User Upload Document (.pdf/.docx/.pptx) hoặc Source Code (.zip)
                        ↓
              [Frontend] UploadZone component
                        ↓
       POST /api/v1/documents/upload (multipart)
                        ↓
          [Backend] storage module: lưu file + metadata
                        ↓
            return { document_id: 123, file_type: "pdf" }
                        ↓
    User click "Generate Questions" hoặc "Scan Code"
                        ↓
  POST /api/v1/assessment/generate-questions  { document_id, persona }
                        ↓
       [Backend] tạo job_id, return { job_id: "abc" }
                        ↓
   [Backend BackgroundTasks] chạy AI pipeline async
                        ↓
   ┌────────────────────────────────────────┐
   │ 1. Parse document (PDF/DOCX/PPTX)      │
   │ 2. Chunk by paragraph (max 1000 tok)   │
   │ 3. Get persona prompt                   │
   │ 4. Build prompt (system + chunks)       │
   │ 5. Call AI via AIGateway                │
   │ 6. Parse JSON response                 │
   │ 7. Save to assessments table            │
   │ 8. Update job status = completed        │
   │ 9. Publish event "assessment.done"     │
   └────────────────────────────────────────┘
                        ↓
   Frontend polls /api/v1/assessment/jobs/{job_id} mỗi 2s
                        ↓
   Job completed → render 10 questions
```

## 2. Code Analysis Flow

```
User Upload Source Code (.zip)
                        ↓
       POST /api/v1/code/scan  { document_id }
                        ↓
        [Backend] tạo job_id, return immediately
                        ↓
   ┌────────────────────────────────────────┐
   │ 1. Extract zip → file tree             │
   │ 2. Filter relevant files (.py/.js/...) │
   │ 3. Skip node_modules/, .git/, dist/    │
   │ 4. Read file content                   │
   │ 5. Chunk (max 5 files, 2000 lines)     │
   │ 6. AI analyze each chunk               │
   │ 7. Aggregate issues                    │
   │ 8. Calculate pass_rate estimate         │
   │ 9. Save to code_analyses table         │
   └────────────────────────────────────────┘
                        ↓
   Frontend polls job → display issues + suggestions
```

## 3. Persona Flow

```
User selects persona (theory/enterprise/strict)
                        ↓
       Load persona prompt từ .ai/prompts/persona/
                        ↓
       Inject chunks + persona prompt → AI Gateway
                        ↓
   AI generates persona-specific questions
                        ↓
   Return JSON: { questions: [...10 items] }
                        ↓
   Frontend render tab theo persona
```

## 4. Mock Defense Flow

```
User click "Vào phòng Mock Defense"
                        ↓
   POST /api/v1/meeting/rooms  { name }
                        ↓
   return { room_id, jitsi_url: "https://meet.jit.si/..." }
                        ↓
   ┌────────────────────────────────────────┐
   │ WebSocket connect:                     │
   │ ws://api/v1/meeting/ws/{room_id}      │
   │                                        │
   │ Events:                                │
   │ - timer:start (Host click Start)      │
   │ - timer:tick (every 1s)                │
   │ - phase:change (Thuyết trình → Chất vấn) │
   │ - role:assign (Host chọn vai trò)      │
   │ - document:sync (tài liệu đồng bộ)     │
   │ - meeting:end                          │
   └────────────────────────────────────────┘
                        ↓
   Jitsi iframe embed cho video call
                        ↓
   Timer 3 giai đoạn: 15' thuyết trình → 10' chất vấn → 5' nhận xét
                        ↓
   Auto lock micro khi hết thời gian
                        ↓
   Meeting end → trigger evaluation module
```

## 5. Evaluation & PDF Report Flow

```
Meeting ended
                        ↓
   User (Host) nhập điểm theo Rubric:
   - Knowledge (1-10)
   - Presentation (1-10)
   - Reflex (1-10)
   - Code Quality (1-10)
                        ↓
   POST /api/v1/evaluation/scores  { meeting_id, scores }
                        ↓
   Tính average + save to evaluations table
                        ↓
   Trigger report module:
                        ↓
   ┌────────────────────────────────────────┐
   │ 1. AI tổng hợp điểm yếu từ câu hỏi  │
   │ 2. AI generate "Bệnh án đồ án" text  │
   │ 3. Tạo radar_data từ scores            │
   │ 4. Generate PDF (React-PDF)            │
   │ 5. Lưu PDF vào storage                 │
   │ 6. Save report record                  │
   └────────────────────────────────────────┘
                        ↓
   GET /api/v1/report/{id}/pdf
                        ↓
   Download PDF + render Radar Chart
```

## 6. Realtime Flow (WebSocket)

```
Client opens meeting page
        ↓
WebSocket connect → join room
        ↓
Server broadcasts:
  - room:state (initial)
  - timer:tick (every 1s)
  - phase:change
  - role:assign
  - participant:join/leave
  - document:update
        ↓
Client sends:
  - timer:start
  - phase:next
  - role:assign
  - mic:toggle
        ↓
Server validates + broadcasts to all participants
```

## 7. API Flow (REST Convention)

```
Client → API Gateway → Router → Service → Repository → DB
                          ↓
                       AI Gateway (if AI)
                          ↓
                    Response with { data, error, meta }
```

## 8. Queue Flow (Future Phase 2)

```
Client → API → Publish job to Redis Queue
                    ↓
       Worker picks up job → Process AI
                    ↓
       Update job status in DB
                    ↓
       Client polls or receives via WebSocket
```

## 9. Worker Flow (Future Phase 2)

```
Worker Process:
  - Listen on Redis BullMQ
  - For each job:
    - Load document from DB
    - Parse + Chunk
    - Call AI Gateway
    - Save result
    - Publish completion event
```

---

*See architecture files for implementation details: `architecture/07-ai-architecture.md`, `architecture/08-rag.md`, `architecture/10-mock-defense.md`*