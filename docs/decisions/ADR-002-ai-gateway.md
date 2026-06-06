# ADR-002: AI Gateway Abstraction

**Status:** ✅ Accepted  
**Context:** Cần abstraction layer để switch giữa OpenAI và Gemini mà không sửa business logic.  
**Decision:** Dùng abstract class `AIGateway` với provider implementations.  
**Consequences:** Thêm 1 lớp abstraction, nhưng dễ test, dễ switch provider, dễ thêm provider mới.  
**Alternatives:** Gọi trực tiếp OpenAI (khó switch sau này), dùng LangChain (overkill cho MVP).  
**Reason:** MVP cần speed, nhưng không muốn hardcode provider. Abstraction đơn giản là đủ.  
**Tradeoff:** Thêm 1 file abstract, nhưng tiết kiệm thời gian khi cần switch provider.