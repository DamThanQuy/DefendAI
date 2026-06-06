# 13 — Deployment

## Overview

Docker Compose cho local dev → Railway cho staging/production MVP.

## Local Development

```yaml
# docker-compose.yml
services:
  api:    # FastAPI :8000
  web:    # Next.js :3000
  db:     # PostgreSQL :5432
```

## Railway Staging

| Service | Config | Cost |
|---------|--------|------|
| Frontend | Next.js (Railway) | $0 |
| Backend | FastAPI 1 instance | $5 |
| Database | PostgreSQL 1GB | $0 |
| Storage | Local disk | $0 |
| AI API | OpenAI pay-per-use | $20-50 |
| **Total** | | **$25-55** |

## CI/CD

GitHub Actions:
- Push → Auto deploy to Railway
- Run tests before deploy
- Build Docker images

## Related Documents

- `04-folder-structure.md` — Dockerfile location
- `02-tech-stack.md` — Technology choices
- `14-scalability.md` — Scale plan