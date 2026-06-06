# 06 — Frontend Architecture

## Overview

Next.js 14 (App Router) frontend với Tailwind CSS + shadcn/ui.

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Trang chủ | Upload document / source code |
| `/questions` | AI Results | Hiển thị 10 câu hỏi + gợi ý |
| `/code-review` | Code Review | Hiển thị kết quả scan code |
| `/room` | Mock Room | Video call + Timer + Roles |
| `/report` | Report | Radar chart + PDF export |

## State Management

- **Tanstack Query**: Server state (API calls, cache, refetch)
- **Zustand**: Client state (UI state, WebSocket state)

## Key Components

```
components/
├── ui/               # shadcn/ui (Button, Card, Modal, Spinner)
├── features/
│   ├── assessment/   # UploadZone, QuestionList, PersonaTab
│   ├── code-review/  # CodeReviewResult, IssueCard
│   ├── meeting/      # VideoCall, Timer, RoleSelector
│   └── report/       # RadarChart, PDFExport
└── layout/           # Navbar, Sidebar, Footer
```

## Data Flow

```
User → Page → Hook (API call) → Backend → Response → Render
                        ↕ (WebSocket)
                  Hook → State → Re-render
```

## Related Documents

- `02-tech-stack.md` — Frontend tech stack
- `04-folder-structure.md` — Folder structure
- `05-backend.md` — Backend API