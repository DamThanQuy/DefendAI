# ADR-003: Vertical Slice Architecture

**Status:** ✅ Accepted  
**Context:** Cần tổ chức code sao cho dễ maintain, dễ test, dễ mở rộng với team 3 người.  
**Decision:** Dùng Vertical Slice Architecture — mỗi module là domain riêng.  
**Consequences:** Folder structure phức tạp hơn flat structure, nhưng dễ maintain hơn khi project lớn.  
**Alternatives:** Flat structure (routers/services/models root) — dễ start nhưng khó maintain.  
**Reason:** Mỗi module có thể test, deploy, mở rộng độc lập.  
**Tradeoff:** Hơi nhiều folder, nhưng mỗi file nhỏ và rõ ràng.