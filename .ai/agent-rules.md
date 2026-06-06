# Agent Rules — DefendAI

> Rules AI Agent PHẢI tuân theo.

## Absolute Rules (NEVER violate)

1. **Never** call AI provider trực tiếp — luôn qua `AIGateway`
2. **Never** viết SQL trong controller/route
3. **Never** bypass Repository pattern
4. **Never** vi phạm Vertical Slice (modules độc lập)
5. **Never** duplicate logic — dùng Shared Kernel
6. **Never** hardcode API keys, secrets
7. **Never** xử lý AI sync trong HTTP request — dùng BackgroundTasks
8. **Never** modify existing ADR — tạo ADR mới
9. **Never** push to master trực tiếp
10. **Never** skip tests cho new logic
11. **Never** skip docs update
12. **Never** add dependencies without discussion

## Always Do

1. **Always** đọc `README_FOR_AI.md` và `AGENT.md` trước
2. **Always** check ADR trước khi make architectural decision
3. **Always** update `CURRENT_STATE.md` sau khi complete task
4. **Always** follow Vertical Slice pattern
5. **Always** dùng AI Gateway, không direct provider
6. **Always** dùng Repository cho DB access
7. **Always** validate input với Pydantic/Zod
8. **Always** write tests cho new logic
9. **Always** update docs khi thay đổi code
10. **Always** dùng type hints
11. **Always** handle errors properly
12. **Always** commit với conventional commit message

## Task Execution Flow

```
1. Read README_FOR_AI.md
2. Read SYSTEM_CONTEXT.md
3. Read related architecture file
4. Read related ADR(s)
5. Read CURRENT_STATE.md
6. Check if task already done
7. Implement following patterns
8. Write tests
9. Update docs if needed
10. Update CURRENT_STATE.md
11. Commit
12. Report
```

## Decision-Making

Khi gặp quyết định mới:
1. Search existing ADRs first
2. Nếu conflict, propose ADR mới
3. Nếu không conflict, follow existing pattern
4. Document decision in commit message

## When to Ask Human

- Decision thay đổi kiến trúc
- Thêm dependency mới
- Database schema change lớn
- Security concern
- Khi stuck > 2h

## When NOT to Ask

- Bug fixes
- Refactoring
- Adding tests
- Documentation updates
- Standard feature implementation