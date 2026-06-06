# 12 — API Design

## Overview

RESTful API endpoints cho tất cả modules. Prefix: `/api/v1`

## Endpoints

### Assessment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/assessment/generate-questions` | AI generate 10 questions |
| GET | `/api/v1/assessment/jobs/{job_id}` | Poll job status |

### Code Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/code/scan` | AI scan source code |
| GET | `/api/v1/code/jobs/{job_id}` | Poll job status |

### Documents
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/documents/upload` | Upload file |
| GET | `/api/v1/documents/{id}` | Get document info |
| GET | `/api/v1/documents` | List documents |

### Meeting
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/meeting/rooms` | Create room |
| GET | `/api/v1/meeting/rooms/{id}` | Get room info |
| WS | `/api/v1/meeting/ws/{room_id}` | WebSocket |

### Evaluation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/evaluation/scores` | Submit score |
| GET | `/api/v1/evaluation/sessions/{id}/results` | Get results |

### Report
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/report/generate` | Generate PDF report |
| GET | `/api/v1/report/{id}/pdf` | Download PDF |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |

## Response Format

```json
{
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2026-06-06T12:00:00Z",
    "version": "0.1.0"
  }
}
```

## Error Format

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid persona. Must be one of: theory, enterprise, strict"
  },
  "meta": { "timestamp": "..." }
}
```

## Related Documents

- `05-backend.md` — Backend
- `03-module-design.md` — Modules