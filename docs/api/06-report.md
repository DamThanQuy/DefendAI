# 06 — Report API

> Generate và tải báo cáo PDF sau buổi Mock Defense.

## Overview

Module tổng hợp kết quả đánh giá → AI generate "Bệnh án đồ án" text → tạo PDF với radar chart → lưu storage. User có thể tải PDF về.

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/report/generate` | Tạo báo cáo PDF |
| GET | `/api/report/{id}/pdf` | Tải PDF |

---

## POST `/api/report/generate`

Tạo báo cáo PDF từ kết quả đánh giá.

### Request

```json
{
  "evaluation_id": 1
}
```

### Response (202 Accepted)

```json
{
  "report_id": "report-001",
  "status": "processing",
  "evaluation_id": 1
}
```

### Flow

```
POST /api/report/generate { evaluation_id }
        ↓
Load evaluation scores + questions history
        ↓
┌────────────────────────────────────────┐
│ 1. AI tổng hợp điểm yếu từ câu hỏi     │
│ 2. AI generate "Bệnh án đồ án" text    │
│ 3. Tạo radar_data từ scores             │
│ 4. Generate PDF (React-PDF)             │
│ 5. Lưu PDF vào storage                  │
│ 6. Save report record                   │
└────────────────────────────────────────┘
        ↓
Return { report_id, status: "completed", pdf_url }
```

---

## GET `/api/report/{id}/pdf`

Tải file PDF báo cáo.

### Response

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="report-001.pdf"

[binary PDF data]
```

### Error Cases

| Status | Message |
|--------|---------|
| 404 | Report not found |
| 404 | PDF not ready yet (processing) |
| 500 | PDF generation failed |

---

## Report Content

PDF bao gồm:

```
┌─────────────────────────────────────┐
│           DEFENDAI REPORT           │
│                                     │
│  1. Thông tin buổi defense          │
│     - Tên phòng, ngày, duration     │
│                                     │
│  2. Điểm đánh giá                   │
│     - Knowledge: 8/10               │
│     - Presentation: 7/10            │
│     - Reflex: 6/10                  │
│     - Code Quality: 9/10            │
│     - Average: 7.5/10              │
│                                     │
│  3. Radar Chart (image)             │
│                                     │
│  4. "Bệnh án đồ án" (AI-generated) │
│     - Điểm mạnh                     │
│     - Điểm yếu cần cải thiện       │
│     - Gợi ý cải thiện cụ thể       │
│                                     │
│  5. Danh sách câu hỏi + gợi ý      │
└─────────────────────────────────────┘
```

---

## Edge Cases

| Trường hợp ngoại lệ | Mức ưu tiên | Trạng thái | Ghi chú |
|---------------------|-------------|------------|---------|
| Evaluation không tồn tại | 🔴 Cao | ❌ Chưa giải quyết | Validate evaluation_id |
| PDF generation timeout | 🔴 Cao | ❌ Chưa giải quyết | Retry + fallback |
| Storage đầy | 🔴 Cao | ❌ Chưa giải quyết | Cleanup old PDFs |
| Report đã tồn tại (regenerate) | 🟡 Trung bình | ❌ Chưa giải quyết | Cho phép overwrite |
| Radar chart render lỗi | 🟡 Trung bình | ❌ Chưa giải quyết | Fallback text-only PDF |

---

## Related

- Architecture: [`05-backend.md`](../architecture/05-backend.md)
- Flow: [`FLOW.md`](../../FLOW.md) — Evaluation & PDF Report Flow
