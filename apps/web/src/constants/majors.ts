/**
 * Danh sách ngành học chuẩn của GraduAI.
 * Nội dung và thứ tự cố định — dùng cho dropdown "Ngành học" ở form đăng ký
 * (components/auth/AuthSlider.tsx) và các nơi cần chọn/hiển thị ngành học.
 * Giá trị option = chuỗi ngành học, gửi thẳng lên backend qua field `major`.
 */
export const MAJORS: string[] = [
  "Công nghệ thông tin / Khoa học máy tính",
  "Kỹ thuật máy tính / Điện tử - Viễn thông",
  "Kỹ thuật điện - Tự động hoá",
  "Kỹ thuật cơ khí - Ô tô",
  "Kỹ thuật xây dựng",
  "Kinh tế / Quản trị kinh doanh",
  "Kế toán - Kiểm toán",
  "Tài chính - Ngân hàng",
  "Ngôn ngữ (Anh/Trung/Nhật/Hàn)",
  "Luật",
  "Y - Dược",
  "Du lịch - Khách sạn",
  "Marketing / Truyền thông",
  "Sư phạm",
  "Khác",
];
