# MVP Demo Plan - AI-Powered Project Defense System
*(Timeline: 3 tuần | Đội ngũ: 3 Dev)*

---

## 1. Mục tiêu
Xây dựng bản Beta (MVP) tập trung vào luồng giá trị cốt lõi để khách hàng dùng thử, chứng minh khả năng của AI trong việc hỗ trợ sinh viên chuẩn bị bảo vệ đồ án.

---

## 2. Tech Stack (Đề xuất)
| Layer             | Công nghệ |
|-------------------|-----------|
| **Frontend**      | Next.js / React (Tailwind CSS) |
| **Backend/API**   | Python FastAPI (tối ưu cho AI/Data processing) |
| **Database**      | PostgreSQL (Dữ liệu quan hệ) hoặc MongoDB (Linh hoạt) |
| **AI Engine**     | OpenAI GPT-4o / Gemini 1.5 Pro (Xử lý tài liệu lớn) |
| **Video Call**    | Jitsi Meet API (Tích hợp nhanh, không cần backend riêng) |
| **Reports**       | Chart.js (Radar Chart) + jsPDF / pdfmake (Export PDF) |

---

## 3. Phân công Nhân sự & Phạm vi trách nhiệm

| Dev | Vai trò | Focus chính |
|-----|---------|-------------|
| **Dev A** | Lead Frontend + UI/UX | Frontend chính, đảm bảo luồng người dùng mượt mà, Mock Room, Report View |
| **Dev B (Quý)** | AI Engineer + Backend | Xây dựng AI pipeline, trích xuất tài liệu, Prompt Engineering, API AI |
| **Dev C** | Fullstack Integration | Kết nối Frontend-Backend, tích hợp Video Call, xây dựng Database & Auth |
| **All** | Code Review + Debug | Họp sync ngày, hỗ trợ khẩn cấp khi có blocker |

---

## 4. Lộ trình triển khai (Timeline: 3 Tuần)

### 🔷 TUẦN 1: Setup cực nhanh + AI Module

| Ngày | Dev A | Dev B | Dev C |
|------|-------|-------|-------|
| Ngày 1-2 | **Setup Next.js + Tailwind**, thiết kế UI Kit cơ bản, **UI Upload Document** | **Setup Python FastAPI**, chọn OpenAI/Gemini API, test kết nối | **Setup PostgreSQL/MongoDB**, thiết kế schema Users, Documents, Sessions |
| Ngày 3-4 | **UI Document Preview**, tích hợp upload API | **Prompt Engineering** 3 Personas, test trích xuất text từ PDF/DOCX/PPTX | **API Auth** (JWT/Session), **API upload lưu trữ file & metadata** |
| Ngày 5-6 | **UI AI Results** hiển thị câu hỏi & gợi ý trả lời | **API /generate-questions**: Upload → AI Phân tích → 10 câu hỏi + gợi ý | **WebSocket setup** (chuẩn bị cho real-time features tuần sau) |
| Ngày 7 | **Integration Testing** luồng Upload → AI | **Optimization** prompt & độ trễ API AI | **Deploy** API + DB lên dev environment |

📌 *Deliverable Tuần 1:* Người dùng có thể Upload tài liệu → AI tự động phân tích & sinh câu hỏi phản biện.

---

### 🔶 TUẦN 2: Mock Defense Room + Video Call

| Ngày | Dev A | Dev B | Dev C |
|------|-------|-------|-------|
| Ngày 8-9 | **UI Mock Room** (Layout chính: Video, Document Viewer, Timer) | **R&D Jitsi API**, custom UI overlay (ẩn controls mặc định) | **Schema phiên họp** (Participants, Roles, Timer States) |
| Ngày 10-11 | **UI Timer đếm ngược** 3 giai đoạn: Thuyết trình → Chất vấn → Nhận xét | **AI Prompt tổng hợp real-time**: Gợi ý hội đồng nên hỏi gì | **API quản lý phòng** (Tạo phòng, Join phòng, Phân quyền Host/Participant) |
| Ngày 12-13 | **UI phân quyền** (Host chọn vai trò: Chủ tịch / Thư ký / Phản biện) | **API Session Report** lưu log thời gian mỗi giai đoạn | **WebSocket events** (Timer start/stop, Phase transitions, Role assignments) |
| Ngày 14 | **Integration Testing** toàn luồng: Vào phòng → Đồng hồ chạy → Chuyển phase | **Load testing** AI API khi nhiều người dùng simultaneosly | **End-to-end Testing**, fix bug blocker |

📌 *Deliverable Tuần 2:* Phòng họp trực tuyến hoạt động được với Timer đếm ngược + Phân quyền vai trò.

---

### 🔷 TUẦN 3: Evaluation, Reporting & Polish

| Ngày | Dev A | Dev B | Dev C |
|------|-------|-------|-------|
| Ngày 15-16 | **UI Form chấm điểm** theo 3 tiêu chí: Kiến thức / Thuyết trình / Phản xạ | **AI Review cuối**: Tổng hợp điểm yếu từ câu hỏi + trả lời | **API lưu điểm số**, tính trung bình real-time |
| Ngày 17-18 | **UI Biểu đồ Radar** (Chart.js) hiển thị năng lực | **AI Tổng kết "Bệnh án đồ án"**: Lỗ hổng logic & đề xuất cải thiện | **API Export báo cáo** (JSON data cho PDF) |
| Ngày 19-20 | **UI Export PDF Report**, responsive & printable | **Prompt fine-tuning** dựa trên test cases | **Integration** luồng cuối: Chấm điểm → Radar Chart → Xuất PDF |
| Ngày 21 | **Final Testing**: Happy path từ đầu đến cuối, fix UI bugs | **Prompt tuning** cuối, optimize cost AI API | **Deploy production**, setup CI/CD cơ bản, backup |

---

## 5. Phạm vi tính năng (Scope)

### ✅ Must-have (Có trong MVP)
| # | Tính năng | Owner chính |
|---|-----------|-------------|
| 1 | Upload & Phân tích tài liệu bằng AI | Dev B + C |
| 2 | Giả lập bộ câu hỏi theo 3 Persona (Lý thuyết/Thực tế/Khắt khe) | Dev B |
| 3 | Phòng họp trực tuyến có Timer đếm ngược | Dev C + A |
| 4 | Chấm điểm theo tiêu chí và xuất PDF báo cáo | Dev A + B + C |

### ❌ Out-of-scope (Để sau MVP)
- **Hệ thống thanh toán** → Thay bằng Free usage / Mã mời
- **B2B Workspace cho nhà trường** → Chỉ 1 workspace chung
- **Speech-to-Text tự động** → Ghi chú thủ công trong phòng họp

---

## 6. Kịch bản Demo lý tưởng 🎯

```text
Sinh viên Upload Đồ án 
  → AI gợi ý 10 câu hỏi khó theo Persona
  → Vào phòng Mock Defense tập dượt với bạn bè
  → Giảng viên/Chủ tịch chấm điểm theo Rubric
  → Nhận báo cáo PDF "Bệnh án đồ án" về các lỗ hổng logic
```

---

## 7. Nguyên tắc làm việc nhóm (Ground Rules)

1. **Standup Meeting:** 15 phút mỗi ngày (Mỗi dev nêu: Hôm qua làm gì? Hôm nay làm gì? Có blocker gì không?)
2. **Definition of Done:** Code được + Test thủ công qua Postman/Figma/Trình duyệt trước khi báo hoàn thành
3. **No Silos:** Nếu một task bị stuck quá 4 giờ → Tag team ngay, không tự ôm
4. **Weekend Buffer:** Dự trữ 1 ngày mỗi tuần (Thứ 7 hoặc Chủ nhật) để fix bug khẩn & polish

---

## 8. Milestones đánh dấu tiến độ

| Milestone | Deadline | Pass Criteria |
|-----------|----------|---------------|
| **M1: AI Pipeline hoạt động** | Cuối ngày 7 | Upload PDF → API trả về 10 câu hỏi + gợi ý |
| **M2: Mock Room hoạt động** | Cuối ngày 14 | 2 người vào cùng phòng, Timer chạy 3 phase |
| **M3: Report PDF xuất thành công** | Cuối ngày 21 | Chấm điểm → Radar Chart → PDF "Bệnh án đồ án" |

---

*Plan này tập trung vào tốc độ và song song hóa task. Mỗi dev có domain riêng nhưng không tách biệt, sẵn sàng nhảy vào hỗ trợ khi có blocker.*