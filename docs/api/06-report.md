# 06 — Report API

> Báo cáo & đánh giá sau buổi bảo vệ thử (Mock AI) — màn `/report` và `/report/{id}` của sinh viên.

## Overview

Sinh viên bấm **"Kết thúc & nhận báo cáo"** trong phòng Mock AI → hệ thống chụp lại hội thoại của phiên → worker gọi AI (qua AI Gateway, feature `feedback`) tổng hợp **nhận xét định tính** theo rubric `defense_sep490` trong DB.

- **AI không chấm điểm số.** AI chỉ đánh giá 4 tiêu chí chất lượng theo mức của rubric (`Đạt / Khá / Chưa đạt`), điểm mạnh/yếu, gợi ý cải thiện, độ phủ CLO.
- **Điểm OGA/TDA, radar, điểm tổng** chỉ lấy từ điểm mentor/admin chấm (`defense_scores`, `PUT /api/scoring/meetings/{id}/scores`).
- **Kết luận** (dự báo) tính từ rule SEP490 (BR-B1) + điểm mentor — không phải kết quả chính thức của hội đồng.
- Mỗi phiên Mock AI ↔ đúng 1 báo cáo (`reports.mock_session_id` unique).

Spec nghiệp vụ: [`BAO-CAO-STUDENT-SPEC.md`](../../BAO-CAO-STUDENT-SPEC.md) (mục 9 — quyết định D1–D4).

## Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/mock-ai/end-session` | Kết thúc phiên Mock AI → tạo báo cáo (AI tổng hợp nền) |
| GET | `/api/reports/my-reports` | Danh sách báo cáo của user + thống kê |
| GET | `/api/reports/{report_id}` | Chi tiết 1 báo cáo |
| POST | `/api/reports/{report_id}/regenerate` | Tổng hợp lại nhận xét AI khi lần trước lỗi |

Tất cả cần `Authorization: Bearer <token>`.

## Trạng thái

| Field | Giá trị | Ý nghĩa |
|-------|---------|---------|
| `generation_status` | `pending` | Worker đang tổng hợp. Kẹt quá 15 phút → API trả `failed` |
| | `ready` | Đã có nhận xét AI |
| | `failed` | AI lỗi / quá hạn → SV bấm "Thử lại" (`regenerate`) |
| `status` (hiển thị) | `pending` | "Chờ xử lý" — AI đang tổng hợp hoặc bị lỗi |
| | `in_review` | "Đang xem xét" — có nhận xét AI, chưa có điểm mentor |
| | `completed` | "Hoàn thành" — mentor/admin đã chấm điểm |

---

## POST `/api/mock-ai/end-session`

Lưu snapshot hội thoại của phiên (`mock_chat_sessions`) vào báo cáo và đẩy job `mock_report` vào Redis. FE lưu nốt tin nhắn chưa autosave (`PUT /api/mock-qa/sessions/{id}`) rồi mới gọi endpoint này.

### Request

```json
{ "session_id": 14 }
```

### Response (202 Accepted)

```json
{
  "success": true,
  "message": "Đã kết thúc buổi Mock AI, báo cáo đang được tổng hợp",
  "report_id": 44,
  "generation_status": "pending"
}
```

Gọi lại với cùng phiên:

| Tình huống | Kết quả |
|------------|---------|
| Báo cáo đang `pending` | Trả báo cáo cũ, không tạo job mới |
| Báo cáo `ready`, hội thoại không đổi | Trả báo cáo cũ, không gọi AI |
| Hội thoại đã có thêm lượt mới (hoặc lần trước `failed`) | Chụp lại hội thoại → `pending` → tổng hợp lại |

### Error Cases

| Status | Message |
|--------|---------|
| 400 | Phiên chưa có câu trả lời nào của sinh viên để đánh giá |
| 404 | Không tìm thấy phiên chat (không tồn tại hoặc của người khác) |

---

## GET `/api/reports/my-reports`

Báo cáo của các buổi có `meetings.student_id = user hiện tại`, mới nhất trước.

### Response (200)

```json
{
  "reports": [
    {
      "id": 44,
      "title": "Hệ thống đặt lịch phòng Lab",
      "description": "Nhận xét tổng quan (≤ 220 ký tự)…",
      "source": "ai_mock",
      "status": "completed",
      "generation_status": "ready",
      "final_score": 6.8,
      "reviewer_count": 1,
      "quality_criteria": [{ "key": "br_chac", "label": "BR chắc", "level": "Chưa đạt" }],
      "workspace_id": 3,
      "workspace_name": "Hệ thống đặt lịch phòng Lab",
      "document_name": "SRS_LabBooking_v2.docx",
      "meeting_id": 44,
      "mock_session_id": 14,
      "created_at": "2026-11-02T08:42:10",
      "updated_at": "2026-11-02T08:42:17"
    }
  ],
  "summary": {
    "total": 1, "completed": 1, "in_review": 0, "pending": 0,
    "average_score": 6.8,
    "scale_max": 10
  }
}
```

- `title`: tên đồ án → tên tài liệu → tiêu đề phiên (cắt ≤ 80 ký tự ở ranh giới từ).
- `workspace_id = null` → FE nhóm vào "Chưa gắn đồ án" (phiên không chọn tài liệu thuộc workspace nào).
- `final_score`, `average_score`: chỉ từ điểm mentor/admin; `null` nếu chưa chấm.
- Thời gian là UTC không kèm offset (FE tự đổi sang giờ local).

---

## GET `/api/reports/{report_id}`

### Response (200) — rút gọn

```json
{
  "id": 44,
  "title": "…",
  "source": "ai_mock",
  "status": "completed",
  "generation_status": "ready",
  "generation_error": null,
  "created_at": "2026-11-02T08:42:10",
  "updated_at": "2026-11-02T08:42:17",
  "meeting_id": 44,
  "mock_session_id": 14,
  "workspace": { "id": 3, "name": "…" },
  "document": { "id": 7, "filename": "…" },
  "rubric": {
    "key": "defense_sep490", "name": "…", "version": "1.0", "scale_max": 10, "pass_mark": 5,
    "groups": [
      { "group": "OGA", "weight_pct": 50, "items": [{ "code": "introduction", "label": "Project Introduction", "weight": 4 }] },
      { "group": "TDA", "weight_pct": 50, "items": ["…"] }
    ],
    "quality_criteria": [{ "key": "tinh_thuc_te", "label": "Tính thực tế", "levels": ["Đạt", "Khá", "Chưa đạt"], "description": "…" }],
    "clo": [{ "code": "CLO1", "desc": "Xác định vấn đề & lập SRS" }]
  },
  "ai_review": {
    "overall_comment": "…",
    "quality_criteria": [{ "key": "tinh_thuc_te", "label": "Tính thực tế", "level": "Khá", "comment": "…", "evidence": "trích câu trả lời của SV" }],
    "strengths": ["…"],
    "weaknesses": ["…"],
    "action_items": ["…"],
    "clo_coverage": [{ "clo": "CLO1", "desc": "…", "covered": true, "comment": "…" }]
  },
  "scores": {
    "official": {
      "oga": { "score": 6.7, "scored_items": 7, "total_items": 7, "missing_items": [] },
      "tda": { "score": 6.9, "scored_items": 9, "total_items": 9, "missing_items": [] },
      "final": 6.8, "verdict": "pass", "pass_mark": 5, "scale_max": 10
    },
    "ai": null,
    "items": {
      "OGA": [{ "code": "introduction", "label": "Project Introduction", "weight": 4, "mark": 7.0, "ai_mark": null,
                "reviews": [{ "reviewer_name": "Mentor A", "mark": 7.0, "comment": null, "is_ai": false }] }],
      "TDA": ["…"]
    },
    "reviewer_count": 1
  },
  "rules": {
    "oga_score": 6.7, "pass_mark": 5, "workspace_id": 3, "completion_ratio": 0.64, "total_uc": 14,
    "n_logic": null, "n_showstopper": null, "has_violations": false,
    "rules": [{ "rule_id": "R-FAIL-1", "rule_name": "OGA < 5/10 → cấm bảo vệ", "auto_status": "pass",
                "input_summary": "OGA=6.7", "needs_human": false, "human_decision": null }]
  },
  "verdict": { "code": "pass", "label": "Dự báo: đạt", "reasons": ["Điểm tổng 6.8/10 ≥ 5"], "is_official": false },
  "transcript": [{ "role": "examiner", "content": "…", "time": "10:01" }, { "role": "student", "content": "…", "time": "10:02" }],
  "can_regenerate": false
}
```

- `ai_review` chỉ có khi `generation_status = "ready"`. Tiêu chí `level = null` = "Chưa đủ căn cứ" từ hội thoại.
- `clo_coverage` liệt kê đủ CLO của rubric hiện tại; CLO AI không nhắc tới → `covered: false` (SV cần tự ôn).
- `scores.official`: `null` khi mentor chưa chấm. `scores.items` theo thứ tự `item_order` của rubric (cột `rubrics.config` là JSONB nên thứ tự key của object không được giữ).
- `rules.rules[].auto_status`: `pass` · `violated` · `pending_data` (thiếu dữ liệu đồ án) · `na` (hội đồng xét tay).
- `verdict.code`: `banned` · `redo` · `deferred` · `fail_individual` (rule vi phạm, ưu tiên theo mức nghiêm trọng) · `pass` · `fail` · `insufficient_data`.
- FE poll endpoint này mỗi 4 giây khi `generation_status = "pending"`.

### Error Cases

| Status | Message |
|--------|---------|
| 403 | Bạn không có quyền xem báo cáo này |
| 404 | Báo cáo không tồn tại |

---

## POST `/api/reports/{report_id}/regenerate`

Chỉ dùng khi `generation_status = "failed"` (FE hiện nút "Thử lại" khi `can_regenerate = true`).

### Response (202 Accepted)

```json
{ "report_id": 44, "generation_status": "pending" }
```

### Error Cases

| Status | Message |
|--------|---------|
| 400 | Báo cáo này không có hội thoại để tổng hợp lại |
| 403 | Bạn không có quyền với báo cáo này (chỉ SV chủ báo cáo hoặc admin) |
| 404 | Báo cáo không tồn tại |
| 409 | Báo cáo đang được tổng hợp hoặc đã có nhận xét |

---

## Flow

```
Phòng Mock AI ── "Kết thúc & nhận báo cáo"
        ↓  PUT /api/mock-qa/sessions/{id}   (lưu nốt hội thoại)
        ↓  POST /api/mock-ai/end-session
Meeting(student_id, workspace_id) + Evaluation + Report(pending, transcript)
        ↓  job "mock_report" → Redis queue:defend
Worker: rubric DB + hội thoại (+ trích tài liệu) → AI Gateway (feature "feedback")
        ↓  chuẩn hoá theo rubric (mức ngoài rubric → null, lọc chữ Hán)
Report(ready) ── FE /report/{id} hết poll, hiện nhận xét
        ↓  (sau) mentor/admin: PUT /api/scoring/meetings/{meeting_id}/scores
Report "completed": bảng OGA/TDA, radar, điểm tổng, kết luận theo rule
```

## Phân quyền

| Hành động | Ai được phép |
|-----------|--------------|
| Xem báo cáo, `GET /api/scoring/meetings/{id}/summary`, `GET /api/rules/meetings/{id}/check` | Admin · SV chủ buổi · SV/mentor/người được mời của booking gắn với buổi |
| `PUT /api/scoring/meetings/{id}/scores` | Admin · mentor phụ trách booking của buổi |
| `POST /api/rules/meetings/{id}/decisions` | Admin · mentor phụ trách booking của buổi |
| `regenerate` | Admin · SV chủ báo cáo |

---

## Edge Cases

| Trường hợp ngoại lệ | Mức ưu tiên | Trạng thái | Ghi chú |
|---------------------|-------------|------------|---------|
| Bấm "Kết thúc" 2 lần / 2 request song song | 🔴 Cao | ✅ Đã giải quyết | Unique `mock_session_id` + bắt `IntegrityError` → 1 báo cáo, 1 job |
| Phiên chưa có câu trả lời của SV | 🔴 Cao | ✅ Đã giải quyết | 400, FE disable nút |
| SV xem/chấm báo cáo của người khác | 🔴 Cao | ✅ Đã giải quyết | 403 (`meeting_access`) |
| AI lỗi / trả JSON hỏng | 🔴 Cao | ✅ Đã giải quyết | `failed` + `generation_error`, nút "Thử lại" |
| Worker chết khi đang tổng hợp | 🔴 Cao | ✅ Đã giải quyết | `pending` quá 15 phút → `failed` |
| Job cũ chạy xong sau khi đã có yêu cầu tổng hợp mới | 🟡 Trung bình | ✅ Đã giải quyết | So `requested_at` với `updated_at`, job cũ bỏ qua |
| Tiếp tục chat sau khi đã có báo cáo | 🟡 Trung bình | ✅ Đã giải quyết | Kết thúc lại → chụp hội thoại mới, tổng hợp lại |
| AI trả mức ngoài rubric / bỏ sót tiêu chí | 🟡 Trung bình | ✅ Đã giải quyết | `level = null` ("Chưa đủ căn cứ") |
| AI chèn chữ Hán vào câu tiếng Việt | 🟡 Trung bình | ✅ Đã giải quyết | Prompt cấm + lọc khi chuẩn hoá |
| Rubric sửa trong DB (nhãn, trọng số, CLO) | 🟡 Trung bình | ✅ Đã giải quyết | API đọc rubric hiện tại; thứ tự hạng mục theo `item_order` |
| Hội thoại quá dài so với prompt | 🟢 Thấp | ✅ Đã giải quyết | Giữ 3 lượt đầu + các lượt mới nhất |
| Phiên không gắn đồ án | 🟢 Thấp | ✅ Đã giải quyết | `workspace = null`, nhóm "Chưa gắn đồ án" |
| Xuất PDF báo cáo | 🟡 Trung bình | ❌ Chưa làm | Xem spec mục 9.4 |

---

## Related

- Code: [`routers/reports.py`](../../apps/api/app/routers/reports.py), [`routers/mock_ai.py`](../../apps/api/app/routers/mock_ai.py), [`services/report_builder.py`](../../apps/api/app/services/report_builder.py), [`services/mock_report.py`](../../apps/api/app/services/mock_report.py), [`prompts/mock_report.py`](../../apps/api/app/prompts/mock_report.py)
- Test: `docker exec defense-api pytest tests/test_report_builder.py tests/test_student_report_api.py -v`
- Rubric: [`seed_rubrics.py`](../../apps/api/seed_rubrics.py) (key `defense_sep490`)
