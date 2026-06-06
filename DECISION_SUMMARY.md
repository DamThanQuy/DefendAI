# 📋 DECISION_SUMMARY.md — Tóm tắt ADRs

> AI Agent không cần đọc từng ADR file. File này tóm tắt tất cả.

---

## ADR-001: PostgreSQL

| Field | Value |
|-------|-------|
| **Decision** | Dùng PostgreSQL cho database |
| **Reason** | JSONB cho flexible AI output, pgvector cho RAG future, ACID |
| **Alternative** | MySQL, MongoDB, SQLite |
| **Tradeoff** | Setup Docker cần thiết, nhưng cần cho production |
| **Consequences** | JSONB strategy được adopt, pgvector sẵn sàng cho Phase 3 |

## ADR-002: AI Gateway

| Field | Value |
|-------|-------|
| **Decision** | Abstract `AIGateway` class, không gọi trực tiếp OpenAI |
| **Reason** | Switch provider dễ, dễ test, dễ thêm provider mới |
| **Alternative** | Direct OpenAI, LangChain, LlamaIndex |
| **Tradeoff** | Thêm 1 layer abstraction, nhưng flexible hơn |
| **Consequences** | Business logic không biết provider, prompts ở `.ai/prompts/` |

## ADR-003: Vertical Slice Architecture

| Field | Value |
|-------|-------|
| **Decision** | Mỗi module là 1 domain riêng (assessment, meeting, etc.) |
| **Reason** | Dễ maintain, dễ test, dễ tách microservice sau |
| **Alternative** | Flat structure (routers/services/models root) |
| **Tradeoff** | Hơi nhiều folder, nhưng dễ navigate |
| **Consequences** | Module giao tiếp qua event bus/shared kernel |

## ADR-004: Jitsi Meet

| Field | Value |
|-------|-------|
| **Decision** | Dùng Jitsi Meet API cho video call |
| **Reason** | Free, iframe embed 5 phút, không cần backend |
| **Alternative** | LiveKit, Daily, Agora |
| **Tradeoff** | Quality trung bình, nhưng đủ cho MVP |
| **Consequences** | LiveKit sẽ thay thế ở Phase 2 nếu cần quality cao hơn |

## ADR-005: No Auth MVP

| Field | Value |
|-------|-------|
| **Decision** | Không implement Auth trong MVP |
| **Reason** | Tiết kiệm 30% thời gian, tập trung main functions |
| **Alternative** | Auth từ đầu, Auth đơn giản (username only) |
| **Tradeoff** | Không track được user, nhưng đủ cho demo |
| **Consequences** | Auth sẽ thêm ở Phase 2 với JWT + RBAC |

---

## Decision Patterns

Khi cần quyết định mới:
1. Tạo file `docs/decisions/ADR-XXX-<title>.md`
2. Format: Status, Context, Decision, Consequences, Alternatives, Reason, Tradeoff
3. Update file này (DECISION_SUMMARY.md) với summary
4. Commit với message `docs: add ADR-XXX <title>`

---

*Chi tiết từng ADR xem trong `docs/decisions/ADR-XXX-*.md`*