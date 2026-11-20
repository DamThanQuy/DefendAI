# SPEC — Chức năng Báo cáo cho Role Student (DefendAI)

> Giao cho: **An** (annguyennhat11a221)
> Ngày: 2026-11-01
> Repo: `DamThanQuy/DefendAI` — làm trên nhánh mới từ `master` (gợi ý: `feat/student-report`)
> Mục tiêu: Student xem được **báo cáo đánh giá đồ án của mình** dựa trên **Rubric SEP490** (tiêu chí chấm bảo vệ của ĐH FPT).

---

## 1. Nhiệm vụ là gì?

Student sau khi luyện Mock Defense / bảo vệ qua hệ thống cần xem **báo cáo** gồm:

1. Danh sách báo cáo theo từng đồ án (workspace) của mình + trạng thái (pending / in_review / completed)
2. Điểm chi tiết **theo rubric SEP490**: 2 nhóm **OGA (50%)** + **TDA (50%)**, mỗi nhóm chia hạng mục có trọng số riêng (bảng ở §3)
3. **Nhận xét định tính** theo 4 tiêu chí chất lượng (mức Đạt / Khá / Chưa đạt) — xem §3.5
4. Điểm mạnh / điểm yếu / gợi ý cải thiện (AI tổng hợp từ lịch sử câu hỏi Mock Defense)
5. Radar chart theo hạng mục rubric + quy tắc qua/rớt (§3.7)

---

## 2. Hiện trạng — ĐỪNG làm lại phần đã có

| Thành phần | Trạng thái | Ghi chú |
|---|---|---|
| Backend `GET /api/reports/my-reports` | ✅ Có sẵn | `apps/api/app/routers/reports.py` — trả list report + summary theo user hiện tại |
| Khung trang FE `/report` | ⚠️ Có nhưng **mock data** | `apps/web/src/app/report/page.tsx` — comment trong code: *"Mock data - sẽ thay bằng API call"* |
| `MetricCard.tsx` | ✅ Có | `apps/web/src/components/features/report/` |
| Rubric SEP490 trong DB | ✅ Có sẵn | Table `rubrics`, key **`defense_sep490`**, auto-seed khi startup (đừng hard-code tiêu chí — xem BR-A1 §4.3) |
| Model `Report` / `Evaluation` / `DefenseScore` | ✅ Có | Xem §4.2 |
| ⚠️ Docs cũ `docs/api/06-report.md` | ❌ **SAI — đừng làm theo** | Mô tả radar *Knowledge / Presentation / Reflex / Code Quality* — đó là bản MVP cũ, đã bị thay bằng rubric OGA/TDA thật |

**Việc còn thiếu** = nối FE vào API thật + render theo đúng cấu trúc rubric + bổ sung endpoint chi tiết báo cáo (nếu chưa đủ dữ liệu).

---

## 3. TIÊU CHÍ CHẤM — Rubric SEP490 (nguồn chuẩn)

> Nguồn: FPT University Syllabus `sylID=14065` (Quyết định 377/QĐ-ĐHFPT, 04/09/2026).
> Bản đầy đủ trong repo: `docs/tieu-chi-cham-do-an.md` · Rubric chạy trong DB: `apps/api/seed_rubrics.py` (key `defense_sep490`).

### 3.1 Thông tin chung

| Trường | Giá trị |
|---|---|
| Môn | SEP490 — SE Capstone Project (10 tín chỉ) |
| Thang điểm | 10 (1 chữ số thập phân) |
| Điểm qua | **MinAvgMarkToPass = 5** |
| Nhóm | 4–5 SV, 15 tuần, 3 code iterations, defense 1.5h |
| Sản phẩm | 20–25 use case trung bình (3–7 transactions/use case) |
| Ngôn ngữ tài liệu | Tiếng Anh (bắt buộc) |

### 3.2 Cấu trúc điểm tổng = OGA 50% + TDA 50%

**OGA (On-going Assessment) — 50%, do GVHD chấm:**

| Hạng mục | Weight |
|---|---|
| Project Introduction (R1) | 4% |
| Project Management Plan (R2) | 8% |
| SRS (R3) | 16% |
| SDD (R4) | 18% |
| Testing / STD (R5) | 18% |
| User Guides (R6) | 4% |
| Implementation (R7) | 32% |

**TDA (Thesis Defense Assessment) — 50%, do hội đồng chấm:**

| Hạng mục | Weight |
|---|---|
| Project Introduction | 5% |
| Project Management Plan | 5% |
| Software Requirement | 15% |
| Software Design | 10% |
| Testing | 10% |
| User Guides | 5% |
| **Implementation** | **35%** |
| Presentation Skills | 5% |
| Q&A | 10% |

> Presentation: hội đồng chấm **riêng từng sinh viên**, điểm cá nhân = trung bình các mark.

### 3.3 Map CLO → hạng mục (7 CLO)

| CLO | Hạng mục tương ứng |
|---|---|
| CLO1 — Xác định vấn đề & lập SRS | Software Requirement (SRS) |
| CLO2 — Thiết kế giải pháp | Software Design (SDD) |
| CLO3 — Hiện thực + kiểm thử | Implementation + Testing |
| CLO4 — Quản lý dự án | Project Management Plan |
| CLO5 — Viết báo cáo chuyên nghiệp | User Guides + Report |
| CLO6 — Thuyết trình & giao tiếp | Presentation Skills + Q&A |
| CLO7 — Thái độ chuyên nghiệp | Điểm danh ≥80% buổi họp GVHD, không gian lận |

### 3.4 Artifacts bắt buộc (phải có đủ)

a) PMP · b) SRS · c) SDD · d) Test Plan & STD · e) Software package & User guides

Deliverables chuẩn (map upload trong DefendAI): `R1` Introduction, `R2` PMP, `R3` SRS, `R4` SDD, `R5` STD, `R6` SUG, `R7` Final Report, `SP` Source code (.zip/.rar/.tar.gz).

### 3.5 ⭐ 4 tiêu chí chất lượng (qualitative — phần "đủ sâu")

> Đây là phần AI **không chấm số**, chỉ đánh giá theo mức **Đạt / Khá / Chưa đạt** kèm giải thích. Báo cáo student PHẢI hiển thị phần này.

| Tiêu chí | Ý nghĩa | Dấu hiệu đạt | Dấu hiệu không đạt |
|---|---|---|---|
| **Tính thực tế** | Đồ án chạy được với người dùng thật? | Chạy end-to-end, UI/UX dùng được, deploy được, dữ liệu thật | Chỉ demo trên máy dev, hardcode, UI vỡ |
| **Tính giải quyết vấn đề** | Có tư duy phân tích? | Phân tích nguyên nhân rõ, chọn giải pháp có trade-off, xử lý edge case | Copy/paste không hiểu, không giải thích được vì sao chọn cách làm |
| **BR chắc** | Yêu cầu nghiệp vụ rõ, đầy đủ, nhất quán? | SRS/use case rõ, coverage đủ, map được BR → chức năng | BR mơ hồ, thiếu use case trọng yếu, tự bịa yêu cầu |
| **Giải quyết 1 vấn đề hiện tại** | Đồ án giải quyết pain-point thực tế (không làm lại cái đã có)? | Nêu được pain-point, có khảo sát/so sánh, giá trị rõ | Đề tài chung chung "hệ thống quản lý X", không chỉ rõ vấn đề |

> Đồ án thiếu 1 trong 4 (nhất là "giải quyết vấn đề hiện tại" & "BR chắc") thường bị hội đồng đánh giá thấp dù code chạy được.

### 3.6 Quy tắc qua/rớt (rule check)

| Hạng | Điều kiện |
|---|---|
| **Cấm bảo vệ luôn** | OGA < 5/10, hoặc gian lận (cheating → cấm cả đội) |
| **Hoãn vòng 2 (cả đội)** | Hoàn thành < 75% UC đã cam kết ở R3, hoặc < 20 UC; không chứng minh được tự làm; > 3 lỗi logic; > 1 show-stopper defect |
| **Làm lại đồ án** | Rớt vòng 2, hoặc OGA < 2/10 |
| **Rớt cá nhân** | Không demo được UC nào; không chứng minh được tự làm; > 3 lỗi logic; > 1 show-stopper |

Tư cách bảo vệ: tham gia **≥ 80%** buổi họp với GVHD.

---

## 4. Dữ liệu & API sẵn có

### 4.1 Endpoint đã có

```http
GET /api/reports/my-reports        # list báo cáo của user hiện tại (reports.py)
GET /api/rubrics?scope=defense     # lấy rubric active (key defense_sep490) — render trọng số ĐỘNG từ DB
GET /api/rubrics/{id}              # chi tiết 1 rubric
```

Response thật của `/api/reports/my-reports`:

```json
{
  "reports": [
    {
      "id": 1,
      "title": "<workspace.name>",
      "description": "Dự án đã được đánh giá AI và phản biện từ mentor",
      "status": "pending | in_review | completed",
      "ai_score": 7.5,
      "mentor_count": 3,
      "created_at": "...", "updated_at": "...",
      "workspace_id": 1,
      "session_id": 2
    }
  ],
  "summary": { "total": 0, "completed": 0, "in_review": 0, "pending": 0, "average_score": 0.0 }
}
```

> Logic status hiện tại (`reports.py`): `pass_rate ≥ 70` → completed · `≥ 40` → in_review · còn lại pending.
> `ai_score` lấy từ `evaluation.scores["total"]` — kiểm tra lại nguồn điểm này khi làm (có thể là dữ liệu legacy).

### 4.2 Models liên quan

| Model | Ý nghĩa | Trường chính |
|---|---|---|
| `Report` | Báo cáo tổng hợp | `evaluation_id`, `ai_feedback` (bệnh án đồ án), `weaknesses` (JSON), `pdf_path`, `pass_rate` |
| `Evaluation` | Kết quả đánh giá 1 meeting | `meeting_id`, `reviewer_name`, `scores` (JSON), `radar_data` (JSON) |
| `DefenseScore` | ⭐ Điểm chi tiết per (giám khảo × nhóm × hạng mục) | `meeting_id`, `reviewer_id` (NULL nếu AI), `is_ai`, `group` = `OGA|TDA`, `item_code` ∈ {introduction, pmp, srs, sdd, testing, user_guides, implementation, presentation, qa}, `mark` (0–10, 1 chữ số) |
| `Rubric` | Rubric DB-driven | `key='defense_sep490'`, `config` JSON chứa toàn bộ trọng số §3 |

### 4.3 Quy tắc bất di bất dịch (BR-A1)

> **Không hard-code tiêu chí.** `item_code` trong `defense_scores` tham chiếu `grading.{oga|tda}.items` trong rubric config. FE render trọng số/hạng mục **đọc từ DB** qua `/api/rubrics?scope=defense` — admin sửa rubric là UI tự theo.

### 4.4 Lưu ý về "điểm AI"

- Prompt chấm của AI Mock (`apps/api/app/prompts/mock_qa.py` — `EVALUATION_SYSTEM_PROMPT`) quy định: AI **KHÔNG chấm điểm số**, chỉ nhận xét định tính + trả về `quality_criteria_met` / `criteria_not_met` per câu hỏi.
- Điểm số chính thức chỉ đến từ: (1) `DefenseScore` do **mentor/admin thật** nhập, hoặc (2) `DefenseScore` do AI mock sinh với `is_ai=True, reviewer_id=NULL`.
- 👉 UI báo cáo student: hiển thị **điểm theo DefenseScore + rubric**, phần AI hiển thị dưới dạng **nhận xét + mức Đạt/Khá/Chưa đạt**, không bịa "điểm AI" không có nguồn.

---

## 5. Việc cần làm (task breakdown)

### Backend
1. **Kiểm tra/ổn định `/my-reports`**: response shape trên có đủ cho FE không; nếu thiếu thì bổ sung (giữ backward-compat).
2. **Endpoint chi tiết 1 báo cáo** (nếu chưa có): `GET /api/reports/{workspace_id hoặc report_id}/detail` trả về:
   - Điểm per hạng mục theo rubric (từ `defense_scores` JOIN rubric config, gộp theo `group` + `item_code`, tách nguồn AI vs mentor)
   - Điểm trung bình + radar_data theo 9 hạng mục TDA (hoặc cả OGA+TDA)
   - `ai_feedback`, `weaknesses`, quality criteria tổng hợp, danh sách câu hỏi + nhận xét
   - Pass/fail flags theo §3.6
3. Validate role: chỉ owner của workspace mới xem được report của mình (student); mentor/admin theo logic hiện có.

### Frontend (`apps/web/src/app/report/`)
4. Bỏ toàn bộ mock data → gọi `/api/reports/my-reports`.
5. Trang danh sách: card theo workspace + badge trạng thái + summary (giữ `MetricCard`).
6. Trang/section chi tiết:
   - Tab hoặc section **OGA** / **TDA** — bảng hạng mục + trọng số (đọc từ rubric API) + mark + thanh tiến độ
   - **Radar chart** theo hạng mục — dùng **chart.js + react-chartjs-2** (đã có sẵn trong `apps/web/package.json` — **KHÔNG thêm npm dep mới**)
   - Section 4 tiêu chí chất lượng: badge Đạt/Khá/Chưa đạt + nhận xét
   - Section Điểm mạnh / Điểm yếu / Gợi ý cải thiện (từ `ai_feedback`, `weaknesses`)
   - Banner kết luận Đạt/Trượt/defer theo §3.6
7. Auth guard: student đăng nhập mới thấy `/report`; student khác không xem được report của nhau.

### Test
8. pytest cho endpoint mới + case phân quyền; chạy đủ gate (§7).

---

## 6. Acceptance criteria

- [ ] Student đăng nhập → `/report` thấy **dữ liệu thật** của mình (không còn mock data trong code)
- [ ] Báo cáo render hạng mục + trọng số **từ rubric DB** (sửa rubric trong DB → UI thay đổi, không cần sửa code)
- [ ] Hiển thị đủ: OGA + TDA, radar chart, 4 tiêu chí chất lượng (Đạt/Khá/Chưa đạt), điểm mạnh/yếu/gợi ý, kết luận pass rule
- [ ] Student A không xem được báo cáo của Student B (403)
- [ ] Không thêm npm dependency mới
- [ ] `pytest` (api) + `next build` + `tsc` pass

## 7. Gate trước khi tạo PR

```bash
# Backend
cd apps/api && pytest

# Frontend
cd apps/web && npm run build && npx tsc --noEmit
```

Quy ước repo xem `CONTRIBUTING.md`: conventional commits (`feat(report): ...`), AI calls bắt buộc qua AI Gateway, không commit secret.

---

## 8. File references nhanh

| File | Nội dung |
|---|---|
| `apps/api/app/routers/reports.py` | Endpoint `/my-reports` (bổ sung ở đây) |
| `apps/api/app/routers/rubrics.py` | API đọc rubric |
| `apps/api/seed_rubrics.py` | Rubric `defense_sep490` — nguồn tiêu chí chạy trong DB |
| `apps/api/app/models/assessment.py` | `Evaluation`, `Report` |
| `apps/api/app/models/defense_score.py` | `DefenseScore` (BR-A1 ở docstring) |
| `apps/api/app/prompts/mock_qa.py` | Prompt chấm định tính của AI |
| `apps/web/src/app/report/page.tsx` | Trang FE hiện tại (mock) — thay thế |
| `apps/web/src/components/features/report/MetricCard.tsx` | Component tái sử dụng |
| `docs/tieu-chi-cham-do-an.md` | ⭐ Bản đầy đủ tiêu chí chấm SEP490 (nguồn spec này) |
| `docs/api/06-report.md` | ❌ Bản docs cũ sai — chỉ đọc để hiểu lịch sử, đừng làm theo |

---

## 9. Cập nhật sau khi đối chiếu code & triển khai (2026-11-02)

### 9.1 Quyết định đã chốt

| # | Câu hỏi | Quyết định |
|---|---|---|
| D1 | AI có chấm điểm số không? | **Không.** Mock AI chỉ nhận xét định tính (4 tiêu chí theo mức của rubric, điểm mạnh/yếu/gợi ý, độ phủ CLO). Điểm OGA/TDA + radar chỉ lấy từ `DefenseScore` do mentor/admin chấm. |
| D2 | Báo cáo gắn với gì? | **1 phiên chat Mock AI = 1 báo cáo** (`reports.mock_session_id`, unique). Đồ án suy ra từ tài liệu của phiên qua `workspace_files` (có thể NULL → nhóm "Chưa gắn đồ án"). |
| D3 | `status` nghĩa là gì? | Theo tiến trình, tính lúc đọc: `pending` (AI đang tổng hợp / lỗi) → `in_review` (đã có nhận xét AI, chưa có điểm mentor) → `completed` (mentor/hội đồng đã chấm). |
| D4 | Luồng mock với mentor? | Báo cáo chỉ **đọc** `DefenseScore`/`CommitteeDecision` nếu có. UI chấm điểm + tick rule cho mentor là task riêng. |

### 9.2 Đính chính §2 / §4

- `/api/reports/my-reports` **không "có sẵn"**: bản cũ lỗi 500 (dùng `db.query()` sync trên `AsyncSession`) và join sai bảng → đã viết lại.
- `POST /api/mock-ai/end-session` bản cũ ghi **điểm cứng** (85/100, radar MVP) và FE không có nút nào gọi nó → đã viết lại.
- Endpoint rubric đúng: `GET /api/rubrics/active/defense` (public) và `GET /api/scoring/rubric`. `GET /api/rubrics?scope=defense` không tồn tại; `GET /api/rubrics/{key}` chỉ admin.
- Quy tắc qua/rớt §3.6 **đã có engine** (`services/rules.py`, 7 rule + `CommitteeDecision`) → báo cáo dùng lại, không viết mới.

### 9.3 Đã triển khai

**Backend**
- Migration `rep0000000001`: `meetings.student_id/workspace_id`; `reports` thêm `source`, `generation_status/error`, `mock_session_id`, `document_id`, `quality_criteria`, `strengths`, `action_items`, `clo_breakdown`, `transcript`, `rubric_version`, `updated_at`; rubric `defense_sep490` bổ sung `item_labels` + mô tả 4 tiêu chí (chỉ điền phần thiếu).
- `POST /api/mock-ai/end-session` body `{session_id}` → snapshot hội thoại, xếp job `mock_report` (worker gọi AI Gateway, feature `feedback`) → nhận xét theo rubric DB. Bấm lại khi đang tổng hợp / hội thoại không đổi → không tạo job trùng.
- `GET /api/reports/my-reports` (viết lại), `GET /api/reports/{id}` (chi tiết: rubric, điểm OGA/TDA tách AI/mentor, nhận xét AI, rule check, kết luận dự báo, hội thoại), `POST /api/reports/{id}/regenerate` (khi lỗi / kẹt > 15 phút).
- Phân quyền: chấm điểm / tick rule chỉ mentor phụ trách booking hoặc admin; xem điểm / rule check / báo cáo chỉ chủ buổi, mentor của booking, admin. `find_workspace_for_meeting` chỉ tìm trong workspace của chính sinh viên.

**Frontend**
- `/report`: dữ liệu thật, thống kê, tìm kiếm + lọc trạng thái, nhóm theo đồ án, tự tải lại khi có báo cáo đang tổng hợp.
- `/report/[id]`: banner kết luận, 4 tiêu chí (Đạt/Khá/Chưa đạt), mạnh/yếu/gợi ý, bảng OGA/TDA (nhãn + trọng số từ rubric), radar TDA (chart.js), độ phủ CLO, quy tắc qua/rớt, hội thoại.
- Phòng Mock AI: nút **"Kết thúc & nhận báo cáo"** (lưu nốt tin chưa autosave rồi mới gửi `session_id`).

**Test**: `tests/test_report_builder.py` (unit, không cần DB) · `tests/test_student_report_api.py` (API + phân quyền, cần Postgres).

**Sau khi chạy trên docker (DB thật)**
- Migration `rep0000000002`: các migration BR-A1/B1/B2/B3 (`br01a1d0f00001`, `br01b1a0f00003`, `br01b2a0f00004`, `br01b3a0f00005`) chỉ là stub rỗng → DB mới (docker local, CI, server mới) **thiếu** `defense_scores`, `audit_defense_scores`, `committee_decisions`, `use_case_commitments`, `audit_use_case_commitments`, `audit_code_analysis_issues` → `/api/scoring`, `/api/rules`, `/api/reports` lỗi 500. Migration tạo các bảng này **nếu chưa có** (DB đã có bảng thì bỏ qua).
- Migration `rep0000000003` + `item_order` trong rubric: model khai báo `rubrics.config` là JSONB → Postgres sắp lại key của object (`qa`, `pmp`, `sdd`… lên trước) → bảng điểm/radar/form chấm hiện sai thứ tự syllabus. Thứ tự hạng mục giờ đọc từ list `item_order`.
- Chuẩn hoá output AI: lọc chữ Hán lẫn vào câu tiếng Việt (model đã trả "khi被 hỏi"); prompt cấm thêm. Độ phủ CLO liệt kê đủ CLO của rubric (AI bỏ sót → "chưa đề cập"). Tiêu đề báo cáo cắt ≤ 80 ký tự ở ranh giới từ.
- Đã chạy E2E thật: phiên Mock AI → `end-session` → worker gọi AI (~10–20 giây) → mentor/admin chấm qua API → báo cáo "Hoàn thành" + radar; sinh viên tự chấm bị 403.
- **Deploy:** sau khi pull phải restart `worker` và `worker_multi` (worker không tự reload code) để đăng ký job `mock_report`.

### 9.4 Còn lại (task riêng)

- [ ] UI chấm điểm OGA/TDA + tick rule cho mentor (luồng Mock Room với mentor); tạo báo cáo khi mentor kết thúc booking.
- [ ] WS `/api/mock-qa/{id}/ws` vẫn là stub (câu hỏi hard-code, `process_answer` rỗng).
- [ ] Xuất PDF báo cáo (`reports.pdf_path` chưa dùng).
- [ ] Rule "gian lận"; ngưỡng R-DELAY đọc từ `pass_rules` thay vì giá trị mặc định trong code.
- [x] Cập nhật `docs/api/06-report.md` theo API mới.
- [ ] Bảng `messages` (model `Message`, dùng ở workspace_messages / feedback) cũng không có migration tạo → DB mới thiếu bảng, `tests/test_feedback.py` fail; `scan_user_features` của feedback hỏng cả transaction từ bước đầu. Đếm "đã dùng báo cáo" của feedback chỉ tính report qua booking, chưa tính report Mock AI (`meetings.student_id`).
