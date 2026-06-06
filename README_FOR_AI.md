# 🤖 README_FOR_AI — AI Agent Quick Start

> File này là entry point cho AI Coding Agent. Đọc file này TRƯỚC khi làm bất kỳ task nào.

---

## Read Order (đọc theo thứ tự)

```
1. AGENT.md                    ← Rules + Coding Convention
2. SYSTEM_CONTEXT.md           ← 80% project knowledge
3. ARCHITECTURE_INDEX.md       ← Map các file architecture
4. CURRENT_STATE.md            ← Sprint hiện tại + todo
5. DECISION_SUMMARY.md         ← Tóm tắt ADRs
6. docs/FUNCTIONS.md           ← 19 functions MVP
7. docs/architecture/XX.md     ← File cụ thể theo task
```

## 🚨 ABSOLUTE RULES (không được vi phạm)

| # | Rule | Lý do |
|---|------|-------|
| 1 | **Never call AI Provider directly** | Phải qua AIGateway |
| 2 | **Never write SQL in Controller** | Phải qua Repository |
| 3 | **Never bypass Repository pattern** | Testability |
| 4 | **Never violate Vertical Slice** | Module independence |
| 5 | **Never duplicate logic across modules** | Shared Kernel |
| 6 | **Never hardcode provider/config** | Config via env |
| 7 | **Never use sync AI in HTTP request** | Use BackgroundTasks |
| 8 | **Never add dependencies without discussion** | Project size |
| 9 | **Always reuse existing module** | DRY principle |
| 10 | **Always update docs when changing code** | Docs are source of truth |
| 11 | **Always check ADR before making decision** | Consistency |
| 12 | **Always follow naming convention** | Readability |

## 🤖 AI Agent Workflow

```
User Request → Read README_FOR_AI.md → Read SYSTEM_CONTEXT.md
   ↓
Read related architecture file → Implement → Update tests
   ↓
Update CURRENT_STATE.md → Update docs if needed → Commit
```

## Common Tasks

| Task | Files to read |
|------|---------------|
| Add API endpoint | `architecture/12-api-design.md` + `architecture/05-backend.md` |
| Add AI feature | `architecture/07-ai-architecture.md` + `.ai/prompts/` |
| Update database | `architecture/11-database.md` + `decisions/ADR-001-postgresql.md` |
| Add module | `architecture/03-module-design.md` + `architecture/04-folder-structure.md` |
| Deploy | `architecture/13-deployment.md` |

## Output Format

Khi hoàn thành task, AI Agent phải output:
- ✅ Files changed (list)
- ✅ Tests passed
- ✅ Docs updated
- ✅ CURRENT_STATE.md updated

---

*Full rules: [`AGENT.md`](AGENT.md) · System overview: [`SYSTEM_CONTEXT.md`](SYSTEM_CONTEXT.md)*