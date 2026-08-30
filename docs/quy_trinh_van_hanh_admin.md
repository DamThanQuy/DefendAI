# QUY TRÌNH VẬN HÀNH DÀNH CHO ROLE ADMIN
## Tài liệu Đặc tả Workflow & Giao diện Quản trị Nền tảng Mentoring

---

### 6 Nguyên tắc Thiết kế Nghiệp vụ Áp dụng
1. **Business Capability**: Viết theo Năng lực Nghiệp vụ.
2. **Feature = 1 Business Value**: Mỗi tính năng đem lại 1 giá trị rõ ràng.
3. **Actor visibility**: Actor thấy rõ vai trò/thẩm quyền.
4. **Action Verbs**: Sử dụng động từ hành động chủ động.
5. **Concise Details**: Súc tích, không rườm rà.
6. **Traceability**: Đảm bảo tính truy xuất nguồn gốc.

---

## 1. CÁC WORKFLOW NGHIỆP VỤ CỐT LÕI (BUSINESS WORKFLOWS)

### 1.1 Duyệt & Xác Minh Hồ Sơ Mentor (Mentor Onboarding & Verification)
* **Tác nhân & Hành động**: Admin (Xác minh) & Mentor (Đăng ký)
* **Giá trị Nghiệp vụ**: Đảm bảo chất lượng chuyên môn và tính chính danh của đội ngũ cố vấn trên sàn.
* **Các bước thực hiện (Quy trình chi tiết)**:
  1. **Tiếp nhận hồ sơ**: Hệ thống tự động đẩy hồ sơ Mentor mới đăng ký vào danh sách Chờ duyệt (*Pending Review*).
  2. **Kiểm tra thông tin**: Admin thẩm định bằng cấp, chứng chỉ chuyên môn, liên kết LinkedIn và lịch sử công tác.
  3. **Phê duyệt hồ sơ (Approve)**: Admin bấm `Approve` $\rightarrow$ Hệ thống kích hoạt vai trò Mentor, tạo Profile công khai và gửi Email thông báo thành công.
  4. **Từ chối hồ sơ (Reject)**: Admin chọn lý do từ chối (thiếu chứng chỉ / thông tin không rõ ràng) và bấm `Reject` $\rightarrow$ Hệ thống gửi Email phản hồi kèm lý do bổ sung.

---

### 1.2 Xử Lý Khiếu Nại & Tranh Chấp Lịch Hẹn (Dispute Resolution)
* **Tác nhân & Hành động**: Admin (Trọng tài) & Student/Mentor (Bên liên quan)
* **Giá trị Nghiệp vụ**: Bảo vệ quyền lợi tài chính, nâng cao độ tin cậy và giải quyết xung đột vắng mặt/bùng lịch.
* **Các bước thực hiện (Quy trình chi tiết)**:
  1. **Tiếp nhận Ticket**: Hệ thống ghi nhận phản ánh từ Student hoặc Mentor về một buổi học (*Session*) cụ thể.
  2. **Thẩm định bằng chứng**: Admin kiểm tra Nhật ký trò chuyện (*Chat Log*), minh chứng đính kèm và lịch sử điểm danh tự động.
  3. **Ra quyết định xử lý (Phân xử)**:
     * **Lỗi do Mentor**: Admin hoàn tiền 100% cho Student, đồng thời trừ điểm uy tín hoặc gửi cảnh báo Mentor.
     * **Lỗi do Student**: Admin duyệt giải ngân chi phí cho Mentor và gửi thông báo giải thích cho Student.
     * **Lỗi sự cố kỹ thuật**: Admin hoàn tiền/tặng Voucher bù đắp và chuyển Ticket kỹ thuật cho Dev Team.
  4. **Đóng sự vụ**: Khóa Ticket khiếu nại và lưu vết lịch sử xử lý phục vụ đối soát.

---

### 1.3 Rút Tiền & Đối Soát Tài Chính (Payout & Financial Settlement)
* **Tác nhân & Hành động**: Admin (Kiểm duyệt) & Mentor (Yêu cầu)
* **Giá trị Nghiệp vụ**: Đảm bảo dòng tiền minh bạch, chính xác và phòng chống gian lận tài chính.
* **Các bước thực hiện (Quy trình chi tiết)**:
  1. **Tạo yêu cầu**: Mentor gửi Yêu cầu rút tiền (*Withdrawal Request*) từ ví thu nhập.
  2. **Khóa số dư**: Hệ thống tự động tạm khóa số dư tương ứng và tạo lệnh chờ duyệt trong Dashboard Admin.
  3. **Đối soát nghiệp vụ**: Admin kiểm tra số dư khả dụng, tính hợp lệ của các Session đã hoàn thành và tài khoản ngân hàng thụ hưởng.
  4. **Duyệt chi trả**: Admin bấm `Approve Payout` $\rightarrow$ Hệ thống chuyển trạng thái lệnh thành '*Processing/Completed*' và gửi xác nhận qua Email/SMS.
  5. **Tạm dừng/Từ chối**: Nếu phát hiện bất thường, Admin bấm `Hold/Reject` và yêu cầu Mentor cung cấp thêm thông tin giải trình.

---

### 1.4 Kiểm Duyệt Nội Dung & An Ninh Hệ Thống (Content & Community Moderation)
* **Tác nhân & Hành động**: Admin (Kiểm duyệt viên)
* **Giá trị Nghiệp vụ**: Duy trì môi trường học thuật lành mạnh, ngăn chặn tin rác và bảo vệ thông tin cá nhân.
* **Các bước thực hiện (Quy trình chi tiết)**:
  1. **Phát hiện vi phạm**: Bộ lọc tự động đánh dấu từ khóa cấm hoặc người dùng chủ động bấm `Report` nội dung xấu.
  2. **Rà soát ngữ cảnh**: Admin truy cập danh sách '*Flagged Content*' để xem xét mức độ vi phạm.
  3. **Thực thi chế tài**:
     * **Vi phạm nhẹ**: Admin xóa nội dung/bình luận vi phạm và gửi cảnh báo tự động.
     * **Vi phạm nghiêm trọng**: Admin thực hiện tạm khóa (Block 7 ngày) hoặc khóa vĩnh viễn (Ban) tài khoản vi phạm.

---

## 2. DANH SÁCH MÀN HÌNH GIAO DIỆN ADMIN (UI SCREENS)

Các màn hình quản trị được thiết kế dạng Layout Sidebar cố định giúp Admin chuyển đổi thao tác nhanh chóng:

| Tên Màn Hình (Screen Name) | Mục Tiêu & Tính Năng Chính | Tác Nhân Sử Dụng |
| :--- | :--- | :--- |
| **Overview Dashboard** | Theo dõi chỉ số Tổng doanh thu, lượng User mới, số Session thành công, biểu đồ tăng trưởng. | Super Admin, Manager |
| **Mentor Verification** | Danh sách hồ sơ Mentor chờ duyệt, bộ lọc chứng chỉ, xem chi tiết và nút bấm Duyệt/Từ chối. | Moderator, Admin |
| **Dispute Center** | Quản lý các sự cố khiếu nại, xem lịch sử Chat Log, phân xử hoàn tiền hoặc hủy lịch. | Support Staff, Admin |
| **Financial & Payout** | Danh sách lệnh rút tiền, bảng đối soát hoa hồng sàn, lịch sử giao dịch ngân hàng. | Finance Admin |
| **User Management** | Quản lý danh sách Student/Mentor/Staff, tìm kiếm, phân quyền tài khoản và kích hoạt/khóa User. | Super Admin |
| **System Settings** | Cấu hình % hoa hồng sàn, quản lý danh mục Kỹ năng (Tags), tạo Mã giảm giá (Vouchers). | Super Admin |

---
*Tài liệu được khởi tạo tự động phục vụ dự án — Version 1.0*
