# ADR-001: PostgreSQL cho Database

**Status:** ✅ Accepted  
**Context:** Cần chọn database cho MVP hỗ trợ JSONB, full-text search, và AI feature (pgvector) sau này.  
**Decision:** Dùng PostgreSQL.  
**Consequences:** Cần setup Docker PostgreSQL cho local dev.  
**Alternatives:** MySQL (thiếu JSONB tốt), MongoDB (thiếu ACID), SQLite (không scale được).  
**Reason:** JSONB cho flexible AI output, pgvector cho RAG sau này, ACID cho dữ liệu quan hệ.  
**Tradeoff:** Setup phức tạp hơn SQLite, nhưng cần thiết cho production.