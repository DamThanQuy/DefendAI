# 05 — Evaluation API

> Chấm điểm buổi Mock Defense theo Rubric.

## Overview

Module nhận điểm từ host sau buổi defense → tính average → lưu kết quả. Trigger report module để generate PDF.

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/evaluation/scores` | Gửi điểm đánh giá |
| GET | `/api/evaluation/sessions/{id}/results` | Lấy kết quả đánh giá |

---

## POST `/api/evaluation/scores`

Gửi điểm đánh giá sau buổi Mock Defense.

### Request

```json
{
  "meeting_id": "room-abc123",
  "scores": {
    "knowledge": 8,
    "presentation": 7,
    "reflex": 6,
    "code_quality": 9
  }
}
```

| Field | Type | Range | Mô tả |
|-------|------|-------|-------|
| `meeting_id` | string | — | ID phòng Mock Defense |
| `knowledge` | int | 1-10 | Kiến thức chuyên môn |
| `presentation` | int | 1-10 | Kỹ năng thuyết trình |
| `reflex` | int | 1-10 | Phản xạ trước câu hỏi |
| `code_quality` | int | 1-10 | Chất lượng mã nguồn |

### Response (201 Created)

```json
{
  "evaluation_id": 1,
  "meeting_id": "room-abc123",
  "scores": {
    "knowledge": 8,
    "presentation": 7,
    "reflex": 6,
    "code_quality": 9
  },
  "average": 7.5,
  "created_at": "2026-06-14T13:00:00Z"
}
```

### Flow

```
POST /api/evaluation/scores { meeting_id, scores }
        ↓
Validate meeting_id tồn tại + đã kết thúc
        ↓
Tính average = (knowledge + presentation + reflex + code_quality) / 4
        ↓
Save to evaluations table
        ↓
Trigger report module → generate PDF
```

---

## GET `/api/evaluation/sessions/{id}/results`

Lấy kết quả đánh giá + radar chart data.

### Response (200 OK)

```json
{
  "evaluation_id": 1,
  "meeting_id": "room-abc123",
  "scores": {
    "knowledge": 8,
    "presentation": 7,
    "reflex": 6,
    "code_quality": 9
  },
  "average": 7.5,
  "radar_data": {
    "labels": ["Kiến thức", "Thuyết trình", "Phản xạ", "Code Quality"],
    "values": [8, 7, 6, 9]
  },
  "created_at": "2026-06-14T13:00:00Z"
}
```

---

## Edge Cases

| Trường hợp ngoại lệ | Mức ưu tiên | Trạng thái | Ghi chú |
|---------------------|-------------|------------|---------|
| Meeting không tồn tại | 🔴 Cao | ❌ Chưa giải quyết | Validate meeting_id |
| Meeting chưa kết thúc | 🟡 Trung bình | ❌ Chưa giải quyết | Chỉ cho phép chấm điểm sau khi meeting end |
| Điểm ngoài range 1-10 | 🔴 Cao | ❌ Chưa giải quyết | Validate min/max score |
| Chấm điểm trùng lặp | 🟡 Trung bình | ❌ Chưa giải quyết | Cho phép overwrite hoặc reject |
| Thiếu field điểm | 🟡 Trung bình | ❌ Chưa giải quyết | Validate đầy đủ 4 field |

---

## Related

- Flow: [`FLOW.md`](../../FLOW.md) — Evaluation & PDF Report Flow
