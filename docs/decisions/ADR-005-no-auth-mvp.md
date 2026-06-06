# ADR-005: Không Auth trong MVP

**Status:** ✅ Accepted  
**Context:** MVP 3 tuần cần tập trung main functions, không có thời gian cho Auth.  
**Decision:** Không implement Auth/ Login trong MVP. Mọi user đều anonymous.  
**Consequences:** Tiết kiệm 30% thời gian, nhưng không track được user, không phân quyền.  
**Alternatives:** Auth từ đầu (tốn thêm 3-5 ngày), Auth đơn giản (username only).  
**Reason:** MVP tập trung demo main function. Auth sẽ thêm ở Phase 2.  
**Tradeoff:** Không track được user activity, nhưng đủ cho demo và internal testing.