# 12 — Thiết kế API

## Tổng quan

Các endpoint RESTful cho tất cả modules. Prefix: `/api/v1`

## Danh sách Endpoint

### Đánh giá (Assessment)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/assessment/generate-questions` | AI sinh 10 câu hỏi |
| GET | `/api/v1/assessment/jobs/{job_id}` | Kiểm tra trạng thái job |

### Phân tích mã nguồn (Code Analysis)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/code/scan` | AI quét mã nguồn |
| GET | `/api/v1/code/jobs/{job_id}` | Kiểm tra trạng thái job |

### Tài liệu (Documents)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/documents/upload` | Upload file |
| GET | `/api/v1/documents/{id}` | Lấy thông tin tài liệu |
| GET | `/api/v1/documents` | Danh sách tài liệu |

### Phòng họp (Meeting)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/meeting/rooms` | Tạo phòng |
| GET | `/api/v1/meeting/rooms/{id}` | Lấy thông tin phòng |
| WS | `/api/v1/meeting/ws/{room_id}` | WebSocket |

### Đánh giá điểm (Evaluation)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/evaluation/scores` | Gửi điểm |
| GET | `/api/v1/evaluation/sessions/{id}/results` | Lấy kết quả |

### Báo cáo (Report)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| POST | `/api/v1/report/generate` | Tạo báo cáo PDF |
| GET | `/api/v1/report/{id}/pdf` | Tải PDF |

### Kiểm tra sức khỏe (Health)
| Phương thức | Endpoint | Mô tả |
|------------|----------|-------|
| GET | `/health` | Kiểm tra server |

## Định dạng Response

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

## Định dạng Lỗi

```json
{
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Persona không hợp lệ. Phải là một trong: theory, enterprise, strict"
  },
  "meta": { "timestamp": "..." }
}
```

---

## Chi tiết từng Group API

> Xem chi tiết request/response/edge cases tại [`docs/api/`](../api/):

| # | Group | File | Endpoints |
|---|-------|------|-----------|
| 01 | Documents (Upload) | [`docs/api/01-documents.md`](../api/01-documents.md) | 3 |
| 02 | Assessment | [`docs/api/02-assessment.md`](../api/02-assessment.md) | 2 |
| 03 | Code Review | [`docs/api/03-code-review.md`](../api/03-code-review.md) | 2 |
| 04 | Meeting | [`docs/api/04-meeting.md`](../api/04-meeting.md) | 3 |
| 05 | Evaluation | [`docs/api/05-evaluation.md`](../api/05-evaluation.md) | 2 |
| 06 | Report | [`docs/api/06-report.md`](../api/06-report.md) | 2 |

## Tài liệu liên quan

- `docs/api/README.md` — API Documentation Index
- `05-backend.md` — Backend
- `03-module-design.md` — Modules
