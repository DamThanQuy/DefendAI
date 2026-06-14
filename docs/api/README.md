# API Documentation Index

> Chi tiết từng group API. Tổng quan endpoints + response format xem tại [`architecture/12-api-design.md`](../architecture/12-api-design.md).

## Quick Links

| # | Group | File | Endpoints | Edge Cases |
|---|-------|------|-----------|------------|
| 01 | Documents (Upload) | [01-documents.md](./01-documents.md) | 3 | 21 |
| 02 | Assessment | [02-assessment.md](./02-assessment.md) | 2 | TBD |
| 03 | Code Review | [03-code-review.md](./03-code-review.md) | 2 | TBD |
| 04 | Meeting | [04-meeting.md](./04-meeting.md) | 3 | TBD |
| 05 | Evaluation | [05-evaluation.md](./05-evaluation.md) | 2 | TBD |
| 06 | Report | [06-report.md](./06-report.md) | 2 | TBD |

## Conventions

### Response Format

Mọi endpoint trả về format chuẩn:

```json
{
  "data": {},
  "error": null,
  "meta": {
    "timestamp": "2026-06-06T12:00:00Z",
    "version": "0.1.0"
  }
}
```

### Error Format

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Chi tiết lỗi"
  },
  "meta": { "timestamp": "..." }
}
```

### Status Icons

| Icon | Ý nghĩa |
|------|---------|
| ✅ | Đã giải quyết |
| ⚠️ | Chưa đầy đủ / Một phần |
| ❌ | Chưa giải quyết |

### File Structure

Mỗi file API group chứa:

1. **Overview** — Mô tả tổng quan
2. **Endpoints** — Danh sách endpoints
3. **Chi tiết từng endpoint** — Request/Response schema
4. **Edge Cases** — Các trường hợp ngoại lệ + trạng thái xử lý
5. **Related** — Link tới code + docs liên quan
