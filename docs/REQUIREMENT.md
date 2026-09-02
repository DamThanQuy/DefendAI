# 📋 Yêu cầu (Requirements)

> Phiên bản: 1.1 — MVP (3 tuần), đã đồng bộ rubric SEP490 chính thức theo `document/issue/BR-00` (01/09/2026)
> **Ưu tiên:** Main functions trước, Auth/Login & Monetization phát triển sau
> **Rubric chuẩn:** OGA 50% + TDA 50%, thang 10, MinAvgMarkToPass = 5 — xem [`tieu-chi-cham-do-an.md`](./tieu-chi-cham-do-an.md) §4

---

## 1. Quản lý Tài liệu & Khảo thí Tự động (AI Assessment)

### 1.1 Phân tích tài liệu đồ án bằng AI
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Phân tích tài liệu và cấu trúc lỗi bằng AI |
| **Actor** | Sinh viên |
| **Trạng thái** | ✅ MVP — Tuần 1 (Quý) |
| **Requirement** | Hệ thống phải cho phép người dùng tải lên các tệp tài liệu đồ án (`.pdf`, `.docx`) và slide thuyết trình (`.pptx`) |
| **Business Value** | Giúp sinh viên tự động rà soát toàn bộ nội dung đồ án mà không cần đợi giảng viên hướng dẫn |

### 1.2 Quét Source Code bằng AI
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Quét source code tự động phát hiện lỗi logic, code smell, coding convention |
| **Actor** | Sinh viên |
| **Trạng thái** | ✅ MVP — Tuần 1 (Quý + Dev C) |
| **Requirement** | Hệ thống phải cho phép người dùng tải lên source code (định dạng `.zip` hoặc paste trực tiếp) để AI tự động phân tích: lỗ hổng logic, vi phạm coding convention, code smell, đề xuất cải thiện |
| **Business Value** | Giúp sinh viên phát hiện sớm lỗi kỹ thuật trong code trước khi bảo vệ |

### 1.3 Giả lập bộ câu hỏi phản biện (AI Personas)
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Giả lập bộ câu hỏi phản biện theo phong cách giảng viên |
| **Actor** | Sinh viên |
| **Trạng thái** | ✅ MVP — Tuần 1 (Quý) |
| **Requirement** | Hệ thống phải cho phép người dùng lựa chọn cấu hình "Hội đồng AI" (gồm 3 Persona: **Lý thuyết**, **Thực tế doanh nghiệp**, **Khắt khe**) để AI tự động sinh ra **bộ 10 câu hỏi** bắt bẻ chuyên sâu kèm gợi ý trả lời |
| **Business Value** | Giúp sinh viên làm quen với nhiều kịch bản chất vấn khác nhau để chuẩn bị trước phương án phản biện |

---

## 2. Điều phối Phòng chấm trực tuyến (Mock Defense Session)

### 2.1 Thiết lập và phân vai phòng chấm giả định
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Thiết lập và phân vai phòng chấm giả định |
| **Actor** | Người dùng (không cần đăng nhập) |
| **Trạng thái** | ✅ MVP — Tuần 2 (Dev C + A) |
| **Requirement** | Hệ thống phải cho phép khởi tạo phòng chấm trực tuyến (Video Call), phân quyền cho các vai trò: **Chủ tịch hội đồng**, **Thầy cô phản biện**, **Thư ký**, **Sinh viên thuyết trình** và tự động đồng bộ tài liệu đồ án vào phòng họp. Đồ án trong hệ thống tuân theo **state machine 4 trạng thái**: `Đang học → Không được bảo vệ → Bảo vệ lần 1 → Bảo vệ lại lần 2` (mọi chuyển trạng thái logged); trạng thái gate tính năng (bị cấm → khóa mock, banner lý do; vòng 2 → áp điểm cap 80% nếu bật) — chi tiết issue `BR-D1` |
| **Business Value** | Chuẩn hóa quy trình vận hành một buổi bảo vệ đồ án thực tế trên không gian số |

### 2.2 Kiểm soát tiến độ và thời gian phản biện
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Kiểm soát tiến độ và thời gian phản biện |
| **Actor** | Chủ tịch hội đồng (AI hoặc Người thật) |
| **Trạng thái** | ✅ MVP — Tuần 2 (Dev A + C) |
| **Requirement** | Hệ thống phải hiển thị đồng hồ đếm ngược phân chia rõ ràng theo từng giai đoạn: **Thuyết trình → Chất vấn → Nhận xét** và tự động khóa micro của người nói khi hết thời gian quy định. Có preset **"SEP490 Defense" = 45' trình bày+demo + 45' Q&A**, đồng hồ công khai cho mọi role, **hết giờ cắt mic thật** (mô phỏng áp lực hội đồng) — thời lượng lưu config `/admin`, chi tiết issue `BR-D2` |
| **Business Value** | Đảm bảo tính kỷ luật và áp lực thời gian giống như một buổi bảo vệ thật |

---

## 3. Đánh giá & Ghi nhận Phản hồi (Evaluation & Analytics)

### 3.1 Nhập điểm và đánh giá theo Rubric
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Nhập điểm và đánh giá theo rubric chuẩn SEP490 (OGA/TDA) |
| **Actor** | Thành viên hội đồng |
| **Trạng thái** | ✅ MVP — Tuần 3 (Dev A) |
| **Requirement** | Hệ thống phải cung cấp giao diện chấm điểm theo **rubric chuẩn FPT SEP490 đọc từ DB** (không hard-code), gồm 2 nhóm: **OGA 50%** — 7 report (R1 4% · R2 8% · R3 16% · R4 18% · R5 18% · R6 4% · R7 32%) chấm per nhóm; **TDA 50%** — 9 hạng mục (Intro 5 · PMP 5 · Requirement 15 · Design 10 · Testing 10 · User Guides 5 · Implementation 35 · Presentation 5 · Q&A 10) chấm **per sinh viên** (điểm cá nhân = trung bình mark các thành viên hội đồng). Thang 0–10, 1 chữ số thập phân; `Final = OGA×50% + TDA×50%`; ngưỡng pass 5.0. Rubric sửa được qua `/admin` (logged) — chi tiết issue `BR-A1`, `BR-A2` |
| **Business Value** | Chuẩn hóa quy trình đánh giá đúng quy chế trường, giảm thiểu thời gian tính toán thủ công cho hội đồng |

### 3.2 Xuất báo cáo "Bệnh án đồ án"
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Xuất báo cáo "Bệnh án đồ án": rule check đậu/trượt + radar rubric |
| **Actor** | Sinh viên |
| **Trạng thái** | ✅ MVP — Tuần 3 (Quý + A + C) |
| **Requirement** | Hệ thống phải tự động tổng hợp dữ liệu xuất ra báo cáo `.pdf` chứa: **bảng rule check 7 rule cứng** theo syllabus (OGA<5 cấm; <75% UC hoặc <20 UC hoãn; >3 lỗi logic hoặc >1 show-stopper hoãn; rớt vòng 2 hoặc OGA<2 làm lại; rớt cá nhân; cap 80% vòng 2 — mỗi rule kèm bằng chứng, thiếu input hiển thị `pending_data`, **không đoán %**), mục **"Rủi ro trí mạng"** (5 nhóm: Code Blind Test, DB yếu, xung đột nhóm, UML không khớp code, security cơ bản), biểu đồ **radar 9 trục = 9 hạng mục TDA** overlay ngưỡng pass 5.0, và danh sách lỗi phân loại show-stopper/logic/minor — chi tiết issue `BR-B1`, `BR-H2`, `BR-E2`, `BR-B3` |
| **Business Value** | Cung cấp cho sinh viên một lộ trình sửa lỗi rõ ràng, trực quan, đúng tiêu chí hội đồng thật để tối ưu hóa điểm số thi thật |

---

## 4. Các tính năng phát triển sau MVP (Out-of-scope)

### 4.1 Auth / Đăng nhập
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Đăng ký, đăng nhập, JWT |
| **Trạng thái** | ❌ Out-of-scope (MVP) — Phát triển sau |
| **Lý do** | MVP ưu tiên demo main function, không cần login để test |

### 4.2 Thanh toán (Pay-per-use)
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Quản lý lượt dùng và thanh toán |
| **Trạng thái** | ❌ Out-of-scope (MVP) — Dùng free |
| **Lý do** | Phát triển sau khi có user base |

### 4.3 B2B Workspace cho Nhà trường
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Quản lý không gian làm việc cho nhà trường |
| **Trạng thái** | ❌ Out-of-scope (MVP) |
| **Lý do** | Chỉ 1 workspace chung |

### 4.4 Speech-to-Text
| Thông tin | Chi tiết |
|-----------|----------|
| **Feature** | Tự động ghi biên bản bằng giọng nói |
| **Trạng thái** | ❌ Out-of-scope (MVP) — Ghi chú thủ công |
| **Lý do** | Phức tạp, không cần thiết cho demo |

---

## Tổng quan MVP Scope

| Capability | Tính năng | Tuần | Owner | Trạng thái |
|-----------|-----------|------|-------|-----------|
| 1. AI Assessment | Upload tài liệu (.pdf, .docx, .pptx) | 1 | Quý | ✅ |
| 1. AI Assessment | **Quét Source Code** (.zip, paste code) | 1 | **Quý + C** | ✅ **MỚI** |
| 1. AI Assessment | 3 Personas + 10 câu hỏi | 1 | Quý | ✅ |
| 2. Mock Defense | Video Call + Phân vai + state machine vòng đời (BR-D1) | 2 | Dev C + A | ✅ |
| 2. Mock Defense | Timer 3 giai đoạn + preset 45+45 (BR-D2) | 2 | Dev A + C | ✅ |
| 3. Evaluation | Form chấm rubric OGA/TDA DB-driven, điểm per SV (BR-A1/A2) | 3 | Dev A | ✅ |
| 3. Evaluation | Báo cáo PDF: rule engine + rủi ro trí mạng + radar 9 trục (BR-B1/H2/E2) | 3 | Quý + A + C | ✅ |
| — | Auth / Đăng nhập | — | — | ❌ Sau MVP |
| — | Speech-to-Text | — | — | ❌ Sau MVP |
| — | Pay-per-use / Thanh toán | — | — | ❌ Sau MVP |
| — | B2B Workspace | — | — | ❌ Sau MVP |

---

*Xem chi tiết kế hoạch tại [`MVP_PLAN.md`](../MVP_PLAN.md) và [`tasks/`](../tasks/)*