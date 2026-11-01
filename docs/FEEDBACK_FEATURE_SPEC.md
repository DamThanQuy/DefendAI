# TÀI LIỆU ĐẶC TẢ KỸ THUẬT: HỆ THỐNG IN-APP USER FEEDBACK & PRODUCT ANALYTICS
**Hệ thống:** DefendAI (Nền tảng AI hỗ trợ bảo vệ đồ án tốt nghiệp Capstone Project)  
**Vai trò:** Technical Lead / Solution Architect  
**Tài liệu:** `DefendAI/docs/FEEDBACK_FEATURE_SPEC.md`  
**Phiên bản:** 1.0.0  
**Ngày ban hành:** 01/11/2026  
**Trạng thái:** Approved for Implementation  

---

## MỤC LỤC
1. [Tổng quan dự án & Bối cảnh chuyển đổi khảo sát](#1-tổng-quan-dự-án--bối-cảnh-chuyển-đổi-khảo-sát)
2. [Bảng đối chiếu 10 câu hỏi khảo sát từ Google Doc sang cơ chế tương đương](#2-bảng-đối-chiếu-10-câu-hỏi-khảo-sát-từ-google-doc-sang-cơ-chế-tương-đương)
3. [Cơ chế tự động nhận diện gói cước & tính năng đã sử dụng](#3-cơ-chế-tự-động-nhận-diện-gói-cước--tính-năng-đã-sử-dụng)
4. [Cơ chế Smart Conditional Feedback (Trigger <= 3 sao)](#4-cơ-chế-smart-conditional-feedback-trigger--3-sao)
5. [Cơ chế tặng thưởng vé trải nghiệm thật (mock_ai_trial_tickets)](#5-cơ-chế-tặng-thưởng-vé-trải-nghiệm-thật-mock_ai_trial_tickets)
6. [Chính sách chống làm phiền Once-Only trên trang /report](#6-chính-sách-chống-làm-phiền-once-only-trên-trang-report)
7. [Thiết kế Dashboard Analytics Admin](#7-thiết-kế-dashboard-analytics-admin)
8. [Kiến trúc kỹ thuật: Danh sách File Backend, Frontend & Data Model](#8-kiến-trúc-kỹ-thuật-danh-sách-file-backend-frontend--data-model)
9. [Kịch bản kiểm thử End-to-End (E2E Test Plan)](#9-kịch-bản-kiểm-thử-end-to-end-e2e-test-plan)

---

## 1. TỔNG QUAN DỰ ÁN & BỐI CẢNH CHUYỂN ĐỔI KHẢO SÁT

### 1.1. Bối cảnh
Trong các đợt kiểm thử sản phẩm ban đầu và môn học Khởi nghiệp (EXE101 / Capstone), nhóm phát triển thường sử dụng biểu mẫu ngoài như **Google Form** hoặc **Google Doc** để thu thập ý kiến sinh viên bảo vệ đồ án tốt nghiệp. Tuy nhiên, cách làm này bộc lộ các nhược điểm nghiêm trọng:
- **Tỷ lệ hoàn thành cực thấp (Drop-off Rate > 92%):** Sinh viên sau khi nhận báo cáo thẩm định đồ án phải bấm link ngoài, rời khỏi luồng trải nghiệm chính của ứng dụng.
- **Dữ liệu phân mảnh & Thiếu tin cậy:** Sinh viên tự gõ email, tự chọn gói cước và tự tích chọn tính năng đã dùng theo trí nhớ, dẫn tới sai lệch dữ liệu phân tích.
- **Trải nghiệm tĩnh và nhàm chán:** Không có cơ chế kích hoạt thông minh khi gặp lỗi, khảo sát dài dòng khiến người dùng nản lòng.
- **Thiếu động lực hoàn thành:** Không có phần thưởng tức thì để kích thích người dùng phản hồi sâu.

### 1.2. Mục tiêu kiến trúc
Xây dựng **Hệ thống In-App User Feedback** được nhúng trực tiếp vào DefendAI:
1. **Tự động hóa hoàn toàn dữ liệu ngữ cảnh (Zero-Friction Context Detection):** Hệ thống tự truy vấn gói cước, lịch sử dùng tính năng từ DB, người dùng không cần khai báo lại.
2. **Khảo sát có điều kiện thông minh (Smart Conditional Feedback):** Khi đánh giá $\le$ 3 sao, hệ thống lập tức mở rộng ô phân tích pain-point dựa trên đúng tính năng người dùng đã trải nghiệm.
3. **Thúc đẩy chuyển đổi bằng giá trị thật:** Hoàn thành khảo sát được tặng ngay 01 vé `mock_ai_trial_tickets` mở khóa Phòng Mock Room AI 1:1 (trị giá tương đương gói VIP).
4. **Bảo vệ trải nghiệm người dùng (Once-Only Guard):** Cam kết tuyệt đối không popup làm phiền lại một khi đã gửi phản hồi tại trang `/report`.
5. **Dashboard thời gian thực cho Ban Quản trị:** Đo lường CSAT, NPS, Phân tích mức sẵn sàng chi trả (Willingness to Pay) và Phễu chuyển đổi tính năng.

---

## 2. BẢNG ĐỐI CHIẾU 10 CÂU HỎI KHẢO SÁT TỪ GOOGLE DOC SANG CƠ CHẾ TƯƠNG ĐƯƠNG

Dưới đây là bảng đối chiếu chuẩn BA/PM chuyển đổi toàn diện 10 câu hỏi từ Google Form/Doc khảo sát truyền thống sang hệ thống In-App Feedback của DefendAI:

| STT | Câu hỏi Google Doc truyền thống | Định dạng cũ | Nhược điểm / Điểm nghẽn cũ | Cơ chế tương đương trên DefendAI In-App Feedback | Kiểu UI Component & Tương tác | Nguồn dữ liệu | Giá trị mang lại cho BA / PM / Analytics |
|:---:|:---|:---|:---|:---|:---|:---|:---|
| **01** | *Email hoặc Tên tài khoản của bạn là gì?* | Short Text | Người dùng phải nhập thủ công, hay gõ sai hoặc dùng email rác; tỷ lệ bỏ cuộc cao. | **Zero-Friction Identity Injection**: Tự động giải mã từ JWT Session Token của user đang đăng nhập. | Header profile chip (Chỉ hiển thị avatar + tên để chào mừng). | Hệ thống tự động (`users.email`, `users.full_name`) | Đảm bảo tính xác thực 100%, liên kết trực tiếp với UUID của tài khoản, loại bỏ bot/spam. |
| **02** | *Bạn đang sử dụng gói tài khoản nào của DefendAI?* | Multiple Choice (Free / Premium / VIP) | Người dùng hay chọn nhầm, không nhớ chính xác gói đang dùng hoặc thời hạn còn lại. | **Auto Subscription Detection Engine**: Tự động query trạng thái đăng ký active từ database. | Status Badge hiển thị tự động trên modal: `Free Plan` / `Premium` / `VIP`. | Hệ thống tự động (Bảng `subscriptions` & `subscription_plans`) | Phân loại phân khúc khách hàng chính xác để phân tích sự khác biệt về độ hài lòng theo từng bậc phí. |
| **03** | *Bạn đã trải nghiệm những tính năng nào của hệ thống?* | Checkbox nhiều lựa chọn | Người dùng tích chọn cảm tính, bỏ sót tính năng đã dùng hoặc tích vào tính năng chưa mở. | **Database Feature Usage Tracing**: Tự động quét các bảng nghiệp vụ và gắn nhãn "Đã sử dụng", cho phép bổ sung. | Pre-selected Feature Chips kèm badge xanh *"Đã nhận diện từ hoạt động của bạn"*. | Hệ thống tự động (`documents`, `analysis_jobs`, `workspace_questions`, `mock_chats`) | Nắm bắt chính xác hành vi thực tế (Actual Behavior vs Perceived Behavior), phục vụ phân tích Adoption Rate. |
| **04** | *Đánh giá mức độ hài lòng chung của bạn về DefendAI?* | Thang đo 1 - 5 | Giao diện radio button nhàm chán, thiếu phản hồi trực quan khi bấm. | **Interactive 5-Star Micro-Feedback**: 5 ngôi sao hoạt họa mượt mà (Framer Motion), hover preview nhãn cảm xúc. | Animated Star Rating (1: Rất thất vọng $\rightarrow$ 5: Rất hài lòng). | Người dùng tương tác | Đo lường chỉ số CSAT cốt lõi, làm điểm chốt kích hoạt luồng khảo sát điều kiện thông minh. |
| **05** | *Nếu chưa hài lòng, lý do chính khiến bạn thất vọng là gì?* | Long Text (Hiển thị cố định cho tất cả) | Người cho 5 sao vẫn thấy câu hỏi này gây rối mắt; người bất mãn lại ngại viết dài. | **Smart Conditional Friction Discovery**: Chỉ kích hoạt tự động bung ra khi CSAT $\le$ 3 sao. Gợi ý sẵn thẻ lý do. | Conditional Accordion/Drawer + Quick-Tag Pills + Dynamic Textarea. | Người dùng tương tác (Khi Rating $\le$ 3) | Nắm bắt chính xác nguyên nhân churn/dissatisfaction mà không làm phiền người dùng hài lòng. |
| **06** | *Bạn có sẵn sàng giới thiệu DefendAI cho bạn bè / nhóm khác không?* | Linear Scale (0 - 10) | Không giải thích rõ khoảng điểm, sinh viên chọn đại khái không theo chuẩn NPS. | **Standardized NPS Segmented Bar**: Dãy 11 nút số phân cấp trực quan bằng màu sắc (0-6 Đỏ/Cam, 7-8 Vàng, 9-10 Xanh). | Segmented Number Buttons (0-10) kèm nhãn Detractor / Passive / Promoter. | Người dùng tương tác | Tính toán chính xác chỉ số Net Promoter Score (NPS) chuẩn doanh nghiệp SaaS. |
| **07** | *Báo cáo phân tích và chất vấn thử nghiệm giúp ích bao nhiêu % cho sự tự tin của bạn?* | Multiple Choice (% giả định) | Tùy chọn rời rạc, không gắn liền với thời điểm người dùng vừa đọc xong báo cáo. | **In-Moment Value Realization**: Đặt câu hỏi ngay tại trang `/report` khi sinh viên vừa xem xong điểm và radar chart. | 4-Level Confidence Pill Selector ("Tăng vượt bậc", "Tự tin hơn nhiều", "Tạm ổn", "Chưa rõ"). | Người dùng tương tác | Đo lường chỉ số cảm nhận giá trị (Value Realization Rate), chứng minh Product-Market Fit cho đồ án. |
| **08** | *Mức giá bạn sẵn sàng chi trả cho một kỳ đồ án tốt nghiệp là bao nhiêu?* | Short Text / Radio rời rạc | Thu về các con số không đồng nhất (người ghi tháng, người ghi kỳ), khó lượng hóa. | **Van Westendorp Price Point Selector**: Khảo sát WTP chuẩn với các mức giá thực tế của DefendAI. | Interactive Price Cards (0đ Free / 49k Cơ bản / 99k Trọn gói AI / 199k VIP Mentor). | Người dùng tương tác | Phân tích độ co giãn của cầu theo giá (Price Sensitivity) để tối ưu hóa chiến lược định giá. |
| **09** | *Tính năng nào bạn mong muốn DefendAI bổ sung nhất trong kỳ tới?* | Checkbox danh sách dài | Danh sách tĩnh, không cập nhật theo roadmap phát triển của sản phẩm. | **Product Roadmap Voting Chips**: Các thẻ tính năng từ roadmap (Barem FPT, AI Voice Audio, Tự sửa slide). | Selectable Feature Voting Cards (+ Custom input). | Người dùng tương tác | Ưu tiên Backlog theo nhu cầu thực của sinh viên (Data-driven Feature Prioritization). |
| **10** | *Đóng góp ý kiến thêm để nhóm phát triển hoàn thiện sản phẩm?* | Long Text (Bắt buộc) | Bắt buộc nhập khiến sinh viên gõ bừa dấu chấm hoặc bỏ ngang khảo sát. | **Contextual Micro-Thoughts & Auto-Draft**: Ô nhập tùy chọn, hỗ trợ lưu tạm local draft, tự co giãn kích thước. | Auto-expanding Markdown-supported Textarea (Optional). | Người dùng tương tác | Thu thập Voice of Customer (VoC) định tính mà không tạo gánh nặng hoàn thành. |

---

## 3. CƠ CHẾ TỰ ĐỘNG NHẬN DIỆN GÓI CƯỚC & TÍNH NĂNG ĐÃ SỬ DỤNG

### 3.1. Kiến trúc luồng dữ liệu (Data Flow)
Khi modal feedback được mở (hoặc khi trang `/report` chuẩn bị trigger), frontend gửi một request nhẹ đến backend để lấy toàn bộ dữ liệu ngữ cảnh:

```
[Client: /report]
       │
       ▼ GET /api/feedback/context (Bearer JWT)
┌────────────────────────────────────────────────────────┐
│ FastAPI Feedback Service                               │
│ 1. Xác thực User từ JWT                                │
│ 2. Query Active Subscription & Plan                   │
│ 3. Query Usage Logs qua các bảng nghiệp vụ:           │
│    - documents (Tài liệu đồ án)                       │
│    - analysis_jobs (Phân tích Code/SRS)                │
│    - workspace_questions (Bộ câu hỏi phản biện)        │
│    - mock_chat_messages (Phòng Mock AI)                │
│    - bookings (Lịch mentor)                           │
│ 4. Tổng hợp context metadata                           │
└────────────────────────────────────────────────────────┘
       │
       ▼ Trả về JSON Context
[Client: InAppFeedbackModal render tức thì với Badge gói & Feature Chips]
```

### 3.2. Thuật toán phát hiện gói cước (Subscription Detection Algorithm)
Hệ thống xác định gói cước của người dùng theo thứ tự ưu tiên:
1. **Active Subscription trong DB:** Truy vấn bảng `subscriptions` nối với `subscription_plans` với điều kiện:
   $$\text{user\_id} = \text{current\_user.id} \quad \text{AND} \quad \text{status} = \text{'active'} \quad \text{AND} \quad \text{expires\_at} > \text{now()}$$
2. **Fallback qua User Profile:** Nếu chưa có bản ghi bảng `subscriptions`, kiểm tra `users.profile_data -> 'membership' -> 'plan'`.
3. **Mặc định:** Nếu không khớp điều kiện trên, hệ thống gán gói `Free` (`slug: "free"`, `name: "Free Plan"`).

### 3.3. Thuật toán quét tính năng đã sử dụng (Feature Usage Detection)
Backend thực hiện truy vấn tổng hợp bất đồng bộ song song:

```python
# app/services/feedback_service.py (Logic cốt lõi)
async def detect_user_feature_usage(user_id: int, db: AsyncSession) -> dict:
    # 1. Kiểm tra tải lên tài liệu đồ án
    docs_count = (await db.execute(
        select(func.count(Document.id)).where(Document.user_id == user_id)
    )).scalar_one()

    # 2. Kiểm tra phân tích đồ án / mã nguồn
    analysis_count = (await db.execute(
        select(func.count(AnalysisJob.id)).where(AnalysisJob.user_id == user_id)
    )).scalar_one()

    # 3. Kiểm tra câu hỏi phản biện AI
    questions_count = (await db.execute(
        select(func.count(WorkspaceQuestion.id)).where(WorkspaceQuestion.user_id == user_id)
    )).scalar_one()

    # 4. Kiểm tra trải nghiệm Mock Room AI
    mock_sessions_count = (await db.execute(
        select(func.count(MockChatMessage.id)).where(MockChatMessage.user_id == user_id)
    )).scalar_one()

    # 5. Kiểm tra đặt lịch mentor
    mentor_bookings_count = (await db.execute(
        select(func.count(Booking.id)).where(Booking.student_id == user_id)
    )).scalar_one()

    used_features = []
    if docs_count > 0:
        used_features.append({"key": "doc_upload", "label": "Tải lên & Quản lý tài liệu đồ án", "auto_detected": True})
    if analysis_count > 0:
        used_features.append({"key": "code_analysis", "label": "Phân tích tính nhất quán Code & SRS", "auto_detected": True})
    if questions_count > 0:
        used_features.append({"key": "ai_questions", "label": "Ngân hàng câu hỏi phản biện theo Rubric", "auto_detected": True})
    if mock_sessions_count > 0:
        used_features.append({"key": "mock_ai", "label": "Luyện bảo vệ với Giám khảo AI 1:1", "auto_detected": True})
    if mentor_bookings_count > 0:
        used_features.append({"key": "mentor_booking", "label": "Đặt lịch cố vấn với Mentor", "auto_detected": True})

    return {
        "used_features": used_features,
        "stats": {
            "docs_count": docs_count,
            "analysis_count": analysis_count,
            "questions_count": questions_count,
            "mock_messages_count": mock_sessions_count,
            "mentor_bookings_count": mentor_bookings_count,
        }
    }
```

---

## 4. CƠ CHẾ SMART CONDITIONAL FEEDBACK (TRIGGER <= 3 SAO)

### 4.1. Nguyên lý trải nghiệm tương tác động
Mục tiêu của Smart Conditional Feedback là **giảm thiểu ma sát (Friction) tối đa cho người dùng hài lòng, đồng thời khai thác triệt để nguyên nhân từ người dùng chưa hài lòng**.

```
                   [Người dùng chấm CSAT Star Rating]
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
         [Đánh giá >= 4 Sao]               [Đánh giá <= 3 Sao]
                 │                                 │
                 ▼                                 ▼
    - Ẩn cụm Pain-Point Box          - Tự động bung Smooth Accordion:
    - Hiển thị thông điệp cảm ơn       "Rất tiếc vì trải nghiệm chưa trọn vẹn!
    - Tùy chọn gửi lời khen ngợi        Điều gì làm bạn chưa hài lòng?"
                                     - Danh sách Pain-Point Chips theo ngữ cảnh
                                     - Bắt buộc/Khuyến khích điền Textarea chi tiết
```

### 4.2. Danh mục Thẻ lỗi theo ngữ cảnh (Context-Aware Pain-Point Tags)
Hệ thống không hiển thị danh sách thẻ tĩnh mà lọc theo chính các tính năng người dùng **đã sử dụng**:

| Tính năng đã dùng | Thẻ lý do không hài lòng hiển thị (Pills) |
|:---|:---|
| **Chung toàn hệ thống** | `Giao diện khó dùng` • `Tốc độ phản hồi chậm` • `Giá dịch vụ quá cao` • `Gặp lỗi hệ thống (Bug)` |
| **Phân tích Code & SRS** | `Báo lỗi sai thực tế (False Positive)` • `Thời gian quét quá lâu` • `Báo cáo phân tích khó hiểu` |
| **Ngân hàng câu hỏi AI** | `Câu hỏi quá chung chung` • `Câu hỏi quá dễ so với hội đồng thật` • `Chưa sát barem trường` |
| **Phòng Mock Room AI** | `AI trả lời cụt lủn` • `Độ trễ giọng nói/chat cao` • `Không đóng đúng vai giám khảo khó tính` |
| **Xem Báo cáo (/report)** | `Biểu đồ radar khó đọc` • `Không xuất được PDF đẹp` • `Điểm số AI chấm chưa thuyết phục` |

### 4.3. Logic xử lý Validation của Form
- **Trường hợp Rating = 1 hoặc 2 sao:** Bắt buộc phải chọn ít nhất 1 thẻ lý do HOẶC nhập tối thiểu 10 ký tự vào ô Textarea (đảm bảo phản hồi có giá trị hành động cho nhóm phát triển).
- **Trường hợp Rating = 3 sao:** Khuyến khích (Optional) chọn thẻ hoặc nhập ý kiến.
- **Trường hợp Rating = 4 hoặc 5 sao:** Không bắt buộc, Textarea tự động đổi placeholder thành: *"Bạn ấn tượng nhất với tính năng nào của DefendAI? (Tùy chọn)"*.

---

## 5. CƠ CHẾ TẶNG THƯỞNG VÉ TRẢI NGHIỆM THẬT (MOCK_AI_TRIAL_TICKETS)

### 5.1. Mô hình Giá trị Kinh doanh (Business Value Proposition)
- **Vấn đề:** Tính năng Phòng Mock AI 1:1 (`/mock-room-ai`) hiện tại được định vị là tính năng cao cấp dành cho gói **VIP** (199.000đ/tháng). Sinh viên gói Free thường e ngại nâng cấp nếu chưa từng trải nghiệm chất lượng phản biện thực tế của AI.
- **Giải pháp:** Tặng ngay **01 vé `mock_ai_trial_tickets`** vào tài khoản người dùng ngay sau khi gửi phản hồi hợp lệ.
- **Lợi ích kép (Win-Win Loop):**
  1. Sinh viên có động lực 100% để hoàn thành khảo sát chất lượng nhằm nhận vé trị giá 99.000đ.
  2. Nền tảng vừa thu được dữ liệu thị trường quý giá, vừa tạo cơ hội cho sinh viên trải nghiệm tính năng "killer feature", thúc đẩy tỷ lệ chuyển đổi sang gói VIP (Freemium-to-VIP Conversion Hook).

### 5.2. Luồng kỹ thuật cấp phát vé (Atomic Ticket Granting)

```
[Client] ── POST /api/feedback/submit ──> [FastAPI Backend]
                                                 │
                                                 ├── 1. Mở DB Transaction
                                                 ├── 2. Insert vào bảng `user_feedbacks`
                                                 ├── 3. Kiểm tra User đã nhận quà chưa (Idempotency)
                                                 ├── 4. Cập nhật `users.profile_data`:
                                                 │      profile_data["mock_ai_trial_tickets"] = 
                                                 │         current_tickets + 1
                                                 │      profile_data["feedback_status"] = {
                                                 │         "submitted": True,
                                                 │         "submitted_at": now().isoformat(),
                                                 │         "reward_ticket_granted": True
                                                 │      }
                                                 ├── 5. Commit Transaction
                                                 │
[Client] <── HTTP 201 Created (Kèm voucher info) ─┘
    │
    ├── Hiển thị Confetti chúc mừng & Voucher Card
    └── Nút "Vào phòng Mock AI ngay" dẫn đến `/mock-room-ai`
```

### 5.3. Cơ chế Tiêu thụ Vé tại Mock Room AI
Cập nhật logic kiểm tra quyền tại cả Backend và Frontend:
- **Backend Guard (`DefendAI/apps/api/app/routers/mock_qa.py` & `mock_ai.py`):**
  ```python
  # Kiểm tra quyền tạo phiên Mock AI:
  is_vip = await check_vip_status(user, db)
  trial_tickets = user.profile_data.get("mock_ai_trial_tickets", 0)

  if not is_vip and trial_tickets <= 0:
      raise HTTPException(
          status_code=status.HTTP_403_FORBIDDEN,
          detail="Bạn cần gói VIP hoặc 01 Vé Trải Nghiệm Mock AI để sử dụng phòng này."
      )

  # Nếu dùng vé trải nghiệm: trừ 1 vé khi phiên mock chính thức bắt đầu
  if not is_vip and trial_tickets > 0:
      user.profile_data["mock_ai_trial_tickets"] = trial_tickets - 1
      flag_modified(user, "profile_data")
      await db.commit()
  ```
- **Frontend Guard (`DefendAI/apps/web/src/app/mock-room/page.tsx`):**
  ```typescript
  const trialTickets = (user?.profile_data as any)?.mock_ai_trial_tickets || 0;
  const canEnterMockAI = isVip || trialTickets > 0;

  const handleEnterMockAI = () => {
    if (!canEnterMockAI) {
      alert("Phòng Mock AI chỉ dành cho thành viên VIP hoặc tài khoản có Vé Trải Nghiệm.");
      router.push("/checkout?plan=vip&cycle=monthly");
      return;
    }
    router.push("/mock-room-ai");
  };
  ```

---

## 6. CHÍNH SÁCH CHỐNG LÀM PHIỀN ONCE-ONLY TRÊN TRANG /REPORT

### 6.1. Triết lý thiết kế (Zero Survey-Fatigue Policy)
Trang Báo cáo thẩm định (`/report`) là nơi sinh viên cần tập trung cao độ để phân tích lỗi đồ án, đọc nhận xét của AI và chuẩn bị nội dung phản biện. Việc popup liên tục nhảy ra sẽ phá vỡ trải nghiệm (UX interruption). Do đó, hệ thống áp dụng cơ chế bảo vệ 3 lớp **"Once-Only Defense-in-Depth"**.

### 6.2. Ba Lớp Kiểm Soát Hiển Thị (3-Tier Gatekeeping)

```
                       [Sinh viên truy cập /report]
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
       [Lớp 1: Server Check]                  [Lớp 2: Client Check]
  User đã có trong `user_feedbacks`?      LocalStorage có cờ submitted/dismissed?
                 │                                       │
            CÓ: CHẶN NGAY                           CÓ: CHẶN NGAY
                 │                                       │
                 └───────────────────┬───────────────────┘
                                     │ KHÔNG
                                     ▼
                          [Lớp 3: Dwell & Scroll Rule]
                         - Ở trên trang ít nhất 15s?
                         - Hoặc cuộn chuột quá 40% trang?
                                     │
                                    CÓ
                                     ▼
                     [Hiển thị Popup Khảo sát Lần đầu]
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
          [Bấm "Gửi phản hồi"]                    [Bấm "Để sau" (X)]
                 │                                       │
                 ▼                                       ▼
      - Ghi nhận DB vĩnh viễn                 - Set LocalStorage Snooze 7 ngày
      - KHÔNG BAO GIỜ HIỆN LẠI                - Chỉ hiện lại sau 7 ngày nếu
                                                chưa từng gửi phản hồi
```

### 6.3. Chi tiết Kỹ thuật Các Lớp Bảo Vệ
1. **Lớp 1 - Database Level (Server-side Truth):**
   - Trường kiểm tra: `user.profile_data["feedback_status"]["submitted"] == True` hoặc truy vấn bảng `user_feedbacks`.
   - Endpoint `GET /api/feedback/eligibility` trả về `{ "eligible": false, "reason": "already_submitted" }`.
   - Khi `eligible == false`, modal component tuyệt đối không mount vào React DOM.

2. **Lớp 2 - Browser Storage Level (Fast Local Fallback):**
   - Khóa lưu trữ: `defendai_feedback_submitted_${userId} = "true"` (vĩnh viễn).
   - Khóa tạm hoãn: `defendai_feedback_snoozed_until_${userId} = timestamp_miliseconds`.
   - Nếu bấm nút đóng popup ("Để sau"), hệ thống set thời gian hoãn là 7 ngày (`Date.now() + 7 * 86400 * 1000`).

3. **Lớp 3 - Contextual Timing (Golden Moment Trigger):**
   - Không popup ngay khi vừa load trang.
   - Chỉ kích hoạt sau khi sinh viên đã duyệt báo cáo ít nhất **15 giây** (Dwell Time) HOẶC cuộn trang quá **40%** độ dài trang báo cáo.
   - Cung cấp nút cố định nhỏ ở góc phải dưới màn hình: **"💬 Góp ý & Nhận vé VIP"** để người dùng có thể chủ động bấm bất kỳ lúc nào nếu đã vô tình đóng popup.

---

## 7. THIẾT KẾ DASHBOARD ANALYTICS ADMIN

Trang quản trị mới dành riêng cho Trưởng bộ môn, Giảng viên khởi nghiệp và Product Manager tại tuyến đường:  
**URL:** `/admin/feedback-analytics`  
**API Endpoint Backend:** `GET /api/admin/feedback/analytics`  

### 7.1. Bốn Khối Chỉ Số Cốt Lõi (Core Metric Widgets)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        DEFENDAI IN-APP FEEDBACK & ADOPTION ANALYTICS                    │
├───────────────────┬───────────────────┬────────────────────────┬───────────────────────┤
│    CSAT SCORE     │     NPS SCORE     │  WILLINGNESS TO PAY    │ FEATURE ADOPTION RATE │
│    ★ 4.42 / 5.0   │       +52         │      78.4% Paid        │    71.2% Mock AI      │
│  (88.4% Hài lòng) │  (62% Pro/10% Det)│  (Giá tối ưu: 99.000đ) │  (Tăng 3.4x nhờ vé)   │
└───────────────────┴───────────────────┴────────────────────────┴───────────────────────┘
```

#### 1. Khối CSAT (Customer Satisfaction Score)
- **Công thức tính:**  
  $$\text{CSAT Score} = \frac{\sum \text{Stars}}{\text{Total Responses}} \quad ; \quad \text{\% Satisfied} = \frac{\text{Số lượt đánh giá (4 và 5 sao)}}{\text{Total Responses}} \times 100\%$$
- **Biểu đồ hiển thị:**
  - Phân bổ số lượng theo từng mức sao (1★ đến 5★) dạng Bar Chart.
  - Đường xu hướng CSAT (Trend Line) theo tuần/tháng.
  - Bảng tổng hợp các Pain-point phổ biến nhất từ các đánh giá $\le$ 3 sao (Top Negative Tags: ví dụ 42% kêu phân tích code chậm, 28% phản ánh câu hỏi chung chung).

#### 2. Khối NPS (Net Promoter Score)
- **Phân nhóm khách hàng:**
  - **Promoters (9 - 10 điểm):** Đại sứ sản phẩm, sẵn sàng giới thiệu cho nhóm khác.
  - **Passives (7 - 8 điểm):** Hài lòng nhưng chưa trung thành, dễ rời bỏ.
  - **Detractors (0 - 6 điểm):** Khách hàng không hài lòng, có nguy cơ lan truyền tiếng xấu.
- **Công thức tính:**
  $$\text{NPS} = \% \text{Promoters} - \% \text{Detractors} \quad (\text{Thang điểm từ } -100 \text{ đến } +100)$$
- **Biểu đồ hiển thị:** Donut Chart tỷ lệ 3 nhóm kèm điểm số NPS nổi bật ở giữa và biểu đồ cột chi tiết từ 0 đến 10.

#### 3. Khối Phân Tích Độ Nhạy Cảm Giá (Willingness to Pay - WTP)
- **Mục tiêu:** Xác thực giả thuyết kinh doanh môn EXE101 và định giá gói dịch vụ Capstone.
- **Biểu đồ hiển thị:**
  - Histogram phân bổ các mức giá sinh viên lựa chọn: `0đ (Chỉ dùng miễn phí)`, `49.000đ (Gói 1 Đồ án cơ bản)`, `99.000đ (Gói Pro Sinh viên)`, `199.000đ (Gói VIP Mentor 1:1)`.
  - Phân tích tương quan: Mức độ sẵn sàng trả tiền theo Chuyên ngành đồ án (SE, AI, IS, IA) và theo điểm số CSAT.

#### 4. Khối Phễu Chuyển Đổi & Kích Hoạt Tính Năng (Feature Adoption Funnel)
- **Phễu hành vi:**  
  $$\text{Tạo tài khoản} \longrightarrow \text{Upload Đồ án} \longrightarrow \text{Xem Báo cáo (/report)} \longrightarrow \text{Làm Khảo sát} \longrightarrow \text{Kích hoạt Vé Mock AI} \longrightarrow \text{Nâng cấp Trả phí}$$
- **Tác động của Vé Trải Nghiệm:** Thống kê tỷ lệ sinh viên vào phòng Mock AI **trước và sau** khi có chính sách tặng vé `mock_ai_trial_tickets` (Chứng minh tính hiệu quả của chiến lược tăng trưởng Product-Led Growth).

### 7.2. Bảng Danh Sách Phản Hồi Chi Tiết (Detailed Feedback Table)
Hỗ trợ quản trị viên tra cứu chi tiết từng phản hồi:
- **Cột dữ liệu:** Ngày gửi | Sinh viên (Tên + Email) | Gói cước | CSAT (Sao) | NPS | Thẻ lý do / Pain Points | Mức WTP | Ý kiến đóng góp | Trạng thái sử dụng vé thưởng.
- **Bộ lọc đa chiều:** Lọc theo khoảng ngày, theo gói cước (Free/Premium/VIP), theo mức sao ($\le$ 3 sao để xử lý sự cố ngay), tìm kiếm từ khóa.
- **Hành động:** Nút "Xuất dữ liệu Excel/CSV" phục vụ nộp báo cáo môn học EXE101 và lưu trữ hồ sơ dự án.

---

## 8. KIẾN TRÚC KỸ THUẬT: DANH SÁCH FILE BACKEND, FRONTEND & DATA MODEL

### 8.1. Thiết kế Cơ sở Dữ liệu (Database Schema)

#### Bảng mới: `user_feedbacks`
Bảng lưu trữ phản hồi chi tiết của người dùng:

```sql
CREATE TABLE user_feedbacks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    detected_plan_slug VARCHAR(50) NOT NULL DEFAULT 'free',
    used_features JSONB NOT NULL DEFAULT '[]'::jsonb,
    csat_score INTEGER NOT NULL CHECK (csat_score >= 1 AND csat_score <= 5),
    negative_reasons JSONB DEFAULT '[]'::jsonb,
    nps_score INTEGER NOT NULL CHECK (nps_score >= 0 AND nps_score <= 10),
    confidence_impact VARCHAR(50) NOT NULL,
    willingness_to_pay INTEGER NOT NULL DEFAULT 0,
    wishlist_features JSONB DEFAULT '[]'::jsonb,
    open_comment TEXT,
    context_page VARCHAR(255) DEFAULT '/report',
    reward_ticket_granted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
    CONSTRAINT uq_user_feedback_once UNIQUE (user_id)
);

CREATE INDEX idx_user_feedbacks_created_at ON user_feedbacks(created_at);
CREATE INDEX idx_user_feedbacks_csat ON user_feedbacks(csat_score);
CREATE INDEX idx_user_feedbacks_nps ON user_feedbacks(nps_score);
```

#### Cập nhật trường `profile_data` trong bảng `users`:
Dữ liệu vé và trạng thái phản hồi được lưu trữ trong `profile_data` (JSONB) của người dùng:
```json
{
  "mock_ai_trial_tickets": 1,
  "feedback_status": {
    "submitted": true,
    "submitted_at": "2026-11-01T10:30:00Z",
    "reward_ticket_granted": true
  }
}
```

---

### 8.2. Danh sách các File Cần Thêm Mới & Chỉnh Sửa

#### A. Backend (FastAPI / SQLAlchemy)
1. **File Model mới:** `DefendAI/apps/api/app/models/feedback.py`
   - Định nghĩa model SQLAlchemy `UserFeedback`.
   - Thiết lập relationship với model `User`.
2. **File Schema mới:** `DefendAI/apps/api/app/schemas/feedback.py`
   - `FeedbackCreateRequest`: Payload người dùng gửi lên khi hoàn thành khảo sát.
   - `FeedbackContextResponse`: Dữ liệu ngữ cảnh trả về (thông tin user, gói cước active, danh sách tính năng đã dùng).
   - `FeedbackAnalyticsResponse`: Dữ liệu phân tích CSAT, NPS, WTP, Funnel cho Admin.
3. **File Service mới:** `DefendAI/apps/api/app/services/feedback_service.py`
   - Chứa logic phát hiện gói cước, truy vấn lịch sử tính năng đã dùng qua các bảng DB.
   - Xử lý atomic transaction ghi feedback và cộng vé `mock_ai_trial_tickets`.
   - Tính toán các chỉ số thống kê phục vụ Admin Analytics.
4. **File Router mới:** `DefendAI/apps/api/app/routers/feedback.py`
   - `GET /api/feedback/context`: Lấy thông tin ngữ cảnh người dùng & kiểm tra tính đủ điều kiện (eligibility).
   - `POST /api/feedback/submit`: Gửi phản hồi, xác thực Once-Only và cấp vé trải nghiệm.
   - `GET /api/admin/feedback/analytics`: Lấy dữ liệu phân tích tổng hợp (yêu cầu role Admin).
   - `GET /api/admin/feedback/list`: Danh sách phản hồi chi tiết có phân trang và lọc.
5. **Chỉnh sửa Router chính:** `DefendAI/apps/api/app/main.py`
   - Đăng ký `feedback.router` vào ứng dụng FastAPI.
6. **Chỉnh sửa Mock Room Gate:** `DefendAI/apps/api/app/routers/mock_qa.py` và `mock_ai.py`
   - Bổ sung điều kiện kiểm tra và trừ vé `mock_ai_trial_tickets` khi người dùng không có gói VIP.

#### B. Frontend (Next.js 14 / TypeScript / Tailwind / Framer Motion)
1. **File Component Modal mới:** `DefendAI/apps/web/src/components/feedback/InAppFeedbackModal.tsx`
   - Toàn bộ giao diện Dialog tương tác khảo sát.
   - Hiệu ứng chuyển động mượt mà (Framer Motion).
   - Logic Smart Conditional mở rộng khi CSAT $\le$ 3 sao.
   - Bảng 11 nút NPS, bộ chọn mức giá WTP và thẻ tính năng mong muốn.
2. **File Nút Kích Hoạt Nổi mới:** `DefendAI/apps/web/src/components/feedback/FeedbackTriggerButton.tsx`
   - Nút nổi góc phải dưới màn hình "💬 Góp ý & Nhận vé VIP" (chỉ hiện khi chưa gửi phản hồi).
3. **File Thông Báo Quà Tặng mới:** `DefendAI/apps/web/src/components/feedback/FeedbackRewardModal.tsx`
   - Pop-up thẻ Voucher Vé Trải Nghiệm Mock AI 1:1 kèm hiệu ứng pháo hoa Confetti và nút CTA vào phòng ngay.
4. **File API Client mới:** `DefendAI/apps/web/src/lib/feedback-api.ts`
   - Các hàm gọi API: `fetchFeedbackContext()`, `submitFeedback()`, `fetchFeedbackAnalytics()`.
5. **Chỉnh sửa Trang Báo cáo:** `DefendAI/apps/web/src/app/report/page.tsx`
   - Tích hợp hook kiểm tra Once-Only (Server flag + LocalStorage).
   - Thiết lập bộ đếm thời gian Dwell Time (15s) và Scroll Listener để mở modal tự nhiên.
6. **Chỉnh sửa Trang Phòng Mock:** `DefendAI/apps/web/src/app/mock-room/page.tsx`
   - Cập nhật điều kiện vào phòng: `const canEnter = isVip || (user?.profile_data?.mock_ai_trial_tickets > 0);`.
   - Hiển thị huy hiệu số vé trải nghiệm đang có nếu chưa phải là VIP.
7. **File Trang Admin Dashboard mới:** `DefendAI/apps/web/src/app/admin/feedback-analytics/page.tsx`
   - Giao diện báo cáo phân tích CSAT, NPS, WTP, Funnel dành cho Admin.

---

## 9. KỊCH BẢN KIỂM THỬ END-TO-END (E2E TEST PLAN)

### 9.1. Môi trường & Tài khoản Kiểm thử Chuẩn
- **Tài khoản Sinh viên (Student Account):**
  - Email: `student@defendai.dev`
  - Mật khẩu: `DefendAI@123`
  - Vai trò: `student`
  - Trạng thái ban đầu: Gói `Free Plan`, `mock_ai_trial_tickets: 0`, chưa từng gửi phản hồi.
- **Tài khoản Quản trị viên (Admin Account):**
  - Email: `admin@defendai.dev`
  - Mật khẩu: `DefendAI@123`
  - Vai trò: `admin`

---

### 9.2. Ma trận Kịch bản Kiểm thử (Test Scenarios)

#### Test Scenario 1: Luồng Sinh viên - Tự động nhận diện & Smart Conditional Feedback (<= 3 sao)
- **Mục tiêu:** Kiểm tra khả năng tự nhận diện thông tin và bung ô lý do khi CSAT $\le$ 3 sao.
- **Các bước thực hiện:**
  1. Đăng nhập vào hệ thống với tài khoản `student@defendai.dev` / `DefendAI@123`.
  2. Điều hướng đến trang Báo cáo đồ án: `http://localhost:3000/report`.
  3. Quan sát giao diện trong 15 giây hoặc cuộn chuột xuống 50% trang.
  4. **Kỳ vọng bước 1:** Modal khảo sát "Đóng góp ý kiến - Nhận ngay vé VIP Mock AI" tự động hiển thị với hiệu ứng fade-in.
  5. Kiểm tra thông tin tự động nhận diện trên Header modal:
     - Tên/Email: `Student DefendAI` (`student@defendai.dev`).
     - Gói cước: Huy hiệu `Gói Miễn Phí (Free)`.
     - Danh sách tính năng: Tự động tick xanh các tính năng sinh viên đã thực hiện (Upload tài liệu, Phân tích đồ án...).
  6. Tại câu hỏi CSAT, bấm chọn **2 sao (Thất vọng)**.
  7. **Kỳ vọng bước 2 (Smart Conditional):** Cụm "Pain-Point Discovery Box" lập tức bung mở với animation mượt mà. Xuất hiện các thẻ lỗi liên quan đến các tính năng đã dùng (`Phân tích quá lâu`, `Câu hỏi chưa sát barem`...). Ô Textarea chuyển sang trạng thái bắt buộc nhập.
  8. Click chọn thẻ `Câu hỏi chưa sát barem` và nhập "Cần câu hỏi sát với đề tài FinTech hơn".
  9. Chọn điểm NPS: **5** (Nhóm Detractor - hiển thị màu cam đỏ).
  10. Chọn mức WTP: **49.000đ/đồ án**.
  11. Bấm nút **"Gửi đánh giá & Nhận vé VIP"**.
  12. **Kỳ vọng bước 3:** 
      - Request `POST /api/feedback/submit` trả về mã HTTP `201 Created`.
      - Màn hình bắn hiệu ứng Confetti chúc mừng.
      - Hiển thị Voucher: *"Chúc mừng bạn đã nhận được 01 Vé Trải Nghiệm Phòng Mock AI 1:1"*.

---

#### Test Scenario 2: Kiểm thử Chính sách Chống làm phiền Once-Only
- **Mục tiêu:** Đảm bảo khi sinh viên đã gửi phản hồi, popup khảo sát tuyệt đối không bao giờ xuất hiện lại.
- **Các bước thực hiện:**
  1. Sau khi hoàn thành Test Scenario 1, bấm đóng modal voucher.
  2. Bấm phím `F5` tải lại toàn bộ trang `/report`.
  3. Chờ quá 20 giây và cuộn chuột liên tục từ đầu đến cuối trang.
  4. **Kỳ vọng bước 1:** Tuyệt đối không xuất hiện modal popup khảo sát. Nút nổi "💬 Góp ý" ở góc màn hình cũng tự động ẩn hoàn toàn.
  5. Mở DevTools Console, kiểm tra LocalStorage:
     - `localStorage.getItem("defendai_feedback_submitted_student@defendai.dev") === "true"`.
  6. Đăng xuất tài khoản `student@defendai.dev` và đăng nhập lại trên một trình duyệt khác (hoặc xóa sạch LocalStorage nhưng vẫn giữ session).
  7. Truy cập lại `/report`.
  8. **Kỳ vọng bước 2 (Server-side Enforcement):** API `GET /api/feedback/context` trả về flag `already_submitted: true`. Modal vẫn không hiển thị.

---

#### Test Scenario 3: Tiêu thụ Vé Trải nghiệm thật tại Phòng Mock AI 1:1
- **Mục tiêu:** Xác minh vé `mock_ai_trial_tickets` nhận được từ phản hồi thực sự mở khóa được tính năng VIP.
- **Các bước thực hiện:**
  1. Với tài khoản `student@defendai.dev`, điều hướng đến trang `http://localhost:3000/mock-room`.
  2. Quan sát thẻ "Phòng Mock AI (Dành cho VIP)":
  3. **Kỳ vọng bước 1:** Thẻ hiển thị thêm nhãn xanh: *"Bạn đang có 01 Vé Trải Nghiệm Mock AI khả dụng"*.
  4. Bấm vào thẻ "Phòng Mock AI".
  5. **Kỳ vọng bước 2:** Hệ thống KHÔNG chặn hoặc đẩy sang trang thanh toán `/checkout`, mà chuyển hướng thẳng vào `http://localhost:3000/mock-room-ai`.
  6. Tiến hành nhập tin nhắn chat và trao đổi 1 câu hỏi với Giám khảo AI.
  7. Bấm nút "Kết thúc buổi Mock AI".
  8. **Kỳ vọng bước 3:** Buổi mock hoàn thành, tạo báo cáo đánh giá thành công. Số vé `mock_ai_trial_tickets` được cập nhật về `0`.

---

#### Test Scenario 4: Luồng Quản trị viên - Báo cáo Phân tích Dashboard Admin
- **Mục tiêu:** Kiểm tra dữ liệu phản hồi được tổng hợp chính xác theo thời gian thực vào Dashboard Admin.
- **Các bước thực hiện:**
  1. Đăng xuất tài khoản sinh viên.
  2. Đăng nhập tài khoản quản trị: `admin@defendai.dev` / `DefendAI@123`.
  3. Điều hướng đến trang quản trị phân tích: `http://localhost:3000/admin/feedback-analytics`.
  4. **Kỳ vọng bước 1:**
     - Widget CSAT hiển thị đúng điểm số đã chấm (có cập nhật lượt đánh giá mới).
     - Widget NPS hiển thị đúng phân loại Detractor/Promoter tương ứng với điểm 5 của sinh viên.
     - Widget WTP ghi nhận lựa chọn phân khúc 49.000đ.
     - Funnel Adoption ghi nhận sự kiện chuyển đổi qua vé trải nghiệm.
  5. Cuộn xuống bảng "Danh sách phản hồi chi tiết":
     - Dòng đầu tiên hiển thị phản hồi của `student@defendai.dev`.
     - CSAT: `2/5` ★.
     - NPS: `5/10`.
     - Gói cước: `Free`.
     - Lý do chưa hài lòng: `Câu hỏi chưa sát barem`.
     - Ý kiến chi tiết: *"Cần câu hỏi sát với đề tài FinTech hơn"*.
     - Vé thưởng: `Đã cấp (Granted)`.
  6. Bấm nút **"Xuất CSV"**: Trình duyệt tải về file `defendai_feedback_report_<date>.csv` với đầy đủ các trường dữ liệu chuẩn định dạng.

---

## 10. TỔNG KẾT & KẾ HOẠCH TRIỂN KHAI (ROLLOUT MILESTONES)

| Giai đoạn | Nội dung công việc chính | Thời gian dự kiến | Phụ trách |
|:---|:---|:---:|:---:|
| **Phase 1** | Viết migration Alembic tạo bảng `user_feedbacks`, cập nhật `profile_data` và xây dựng service phát hiện gói/tính năng. | Ngày 1 - 2 | Backend Lead |
| **Phase 2** | Xây dựng API submit feedback, cấp vé `mock_ai_trial_tickets`, cập nhật guard kiểm tra vé tại `mock_ai.py` & `mock_qa.py`. | Ngày 3 - 4 | Backend Lead |
| **Phase 3** | Phát triển UI `InAppFeedbackModal.tsx` với Smart Conditional Logic, 5 sao, 11 nút NPS, bộ chọn WTP và thẻ quà tặng. | Ngày 5 - 6 | Frontend Lead |
| **Phase 4** | Tích hợp vào `/report` với chính sách Once-Only 3 lớp (DB check, LocalStorage check, Dwell time listener). | Ngày 7 | Fullstack Dev |
| **Phase 5** | Xây dựng Admin Dashboard Analytics `/admin/feedback-analytics` đo lường CSAT, NPS, WTP và Funnel. | Ngày 8 - 9 | Frontend & Data |
| **Phase 6** | Thực hiện kịch bản kiểm thử E2E với `student@defendai.dev` và `admin@defendai.dev`, nghiệm thu sản phẩm. | Ngày 10 | QA / Lead Architect |

---
*Tài liệu này được biên soạn theo chuẩn đặc tả kỹ thuật phần mềm doanh nghiệp, phục vụ trực tiếp cho việc triển khai thực tế của đội ngũ kỹ sư DefendAI.*
