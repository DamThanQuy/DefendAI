# 🤝 CONTRIBUTING.md — Hướng dẫn đóng góp

> Dành cho Developer (con người và AI Agent) tham gia phát triển GraduAI.

---

## 1. Branch Strategy

| Branch | Mục đích |
|--------|----------|
| `master` | Production branch (protected) |
| `develop` | Integration branch |
| `feature/<name>` | Tính năng mới |
| `dev-a/...`, `dev-b/...`, `dev-c/...` | Branch riêng của từng dev |
| `fix/<name>` | Bug fix |
| `docs/<name>` | Documentation update |

**Quy tắc:**
- Không push trực tiếp vào `master`
- Tạo PR từ feature branch → develop
- Mỗi PR chỉ 1 feature, scope nhỏ

## 2. Commit Convention

```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional)>
```

| Type | Usage | Example |
|------|-------|---------|
| `feat` | New feature | `feat(assessment): add AI question generation` |
| `fix` | Bug fix | `fix(upload): handle .zip file size > 50MB` |
| `docs` | Documentation | `docs(arch): add module design` |
| `refactor` | Code refactor | `refactor(ai): extract prompt builder` |
| `test` | Add tests | `test(assessment): add parser tests` |
| `chore` | Build/CI/deps | `chore(deps): add redis client` |
| `style` | Formatting | `style: fix linting errors` |

**Rules:**
- Subject ≤ 50 chars, lowercase
- Body wrap at 72 chars
- Use imperative mood ("add" not "added")
- Reference issue: `Refs #123` or `Closes #123`

## 3. PR Convention

**Title format:** Same as commit: `<type>(<scope>): <subject>`

**PR Description template:**

```markdown
## What
- Brief description of changes

## Why
- Reason for the change (link to issue/ADR)

## How
- Implementation approach

## Tests
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing done

## Screenshots (if UI)

## Checklist
- [ ] Code follows convention
- [ ] Docs updated
- [ ] No new linter warnings
```

**Review:**
- At least 1 approval required
- Address all comments
- Squash and merge when ready

## 4. Code Review

**Reviewer nên check:**
- Code tuân thủ Vertical Slice pattern
- Tests covering new logic
- Error handling đúng cách
- No hardcoded values
- Docs updated nếu cần
- AI calls qua Gateway (không direct provider)
- SQL qua Repository (không trong controller)

**Author nên:**
- Self-review trước khi request review
- Respond to comments within 24h
- Be open to feedback

## 5. Folder Rule

**Allowed:**
- Add new module in `apps/api/modules/<name>/`
- Add new shared component in `apps/api/shared/`
- Add new doc in `docs/architecture/`

**Not allowed:**
- Modify `docs/architecture/XX.md` without updating SUMMARY
- Modify existing ADR (create new one instead)
- Mix modules in same file

## 6. Testing

| Layer | Coverage | Tool |
|-------|----------|------|
| Service | 70%+ | pytest |
| API | 50%+ | pytest + httpx |
| Frontend | 60%+ | vitest/jest |

**Test naming:** `test_<function_name>.py`

**Test structure (AAA):**
```python
def test_question_service_generates_10_questions():
    # Arrange
    document = create_test_document()
    service = QuestionService(ai_gateway=mock_ai)
    
    # Act
    questions = service.generate(document, persona="theory")
    
    # Assert
    assert len(questions) == 10
```

## 7. Naming

| Item | Convention |
|------|-----------|
| Python files | snake_case |
| TypeScript files | kebab-case |
| Classes | PascalCase |
| Functions | snake_case (Python), camelCase (TS) |
| Constants | UPPER_SNAKE |
| Tables | snake_case + plural |
| Columns | snake_case |
| Env vars | UPPER_SNAKE |

## 8. Documentation Rule

**MUST update docs khi:**
- Thêm/sửa API endpoint
- Thêm/sửa database schema
- Thay đổi module responsibility
- Thay đổi architecture decision (tạo ADR)
- Thêm dependency mới

**Doc files:**
- `docs/architecture/` — Kiến trúc
- `docs/decisions/ADR-XXX-*.md` — Decisions
- `docs/FUNCTIONS.md` — Function list
- `.ai/prompts/` — AI prompts
- `CURRENT_STATE.md` — Sprint status

## 9. Architecture Rule

- **Always** follow Vertical Slice
- **Always** dùng AI Gateway cho AI calls
- **Always** dùng Repository cho DB
- **Always** validate input với Pydantic/Zod
- **Always** async AI processing (background tasks)
- **Never** hardcode provider name
- **Never** viết SQL trong controller
- **Never** duplicate logic — dùng Shared Kernel

## 10. AI Rule (cho AI Agent)

- **Always** đọc `README_FOR_AI.md` và `AGENT.md` trước
- **Always** dùng AI Gateway, không direct provider
- **Always** reference ADR khi make architectural decision
- **Always** update `CURRENT_STATE.md` sau khi code
- **Always** write tests cho new logic
- **Never** add dependencies without discussion
- **Never** skip docs update

## 11. Developer Rule

- **Communication:** Slack/Discord thay vì email
- **Standup:** 15 phút mỗi sáng
- **Code review:** Trong vòng 24h
- **Pair programming:** Khi stuck > 4h
- **Ask early, ask often**

## 12. Best Practices

✅ **Do:**
- Write self-documenting code
- Add type hints
- Write tests first (TDD khi có thể)
- Update docs cùng lúc với code
- Use meaningful commit messages
- Review own code trước khi submit

❌ **Don't:**
- Push to master
- Hardcode secrets
- Skip error handling
- Write duplicate code
- Ignore linting errors
- Leave TODOs không resolve

---

*Questions? Tạo issue trên GitHub.*