import { Crown, Sparkles, Zap } from "lucide-react";

export type BillingCycle = "monthly" | "yearly";

export type Plan = {
  id: "free" | "premium" | "vip";
  name: string;
  tagline: string;
  icon: "sparkles" | "zap" | "crown";
  monthly: number;
  yearly: number;
  featured?: boolean;
  badge?: string;
  features: { label: string; included: boolean; highlight?: boolean }[];
  cta: string;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Khởi đầu miễn phí",
    icon: "sparkles",
    monthly: 0,
    yearly: 0,
    cta: "Bắt đầu miễn phí",
    features: [
      { label: "Upload tối đa 3 đồ án / tháng", included: true },
      { label: "Phân tích tài liệu bằng AI cơ bản", included: true },
      { label: "Tạo 20 câu hỏi phản biện / lượt", included: true },
      { label: "Mock defense 1 lần / tháng", included: true },
      { label: "Báo cáo PDF cơ bản", included: true },
      { label: "Phân tích code chuyên sâu", included: false },
      { label: "Đánh giá theo rubric chi tiết", included: false },
      { label: "Hỗ trợ mentor 1-1", included: false },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Cho sinh viên nghiêm túc",
    icon: "zap",
    monthly: 99000,
    yearly: 990000,
    featured: true,
    badge: "Phổ biến nhất",
    cta: "Nâng cấp Premium",
    features: [
      { label: "Upload không giới hạn đồ án", included: true, highlight: true },
      { label: "Phân tích tài liệu AI nâng cao", included: true },
      { label: "Không giới hạn câu hỏi phản biện", included: true },
      { label: "Mock defense không giới hạn", included: true, highlight: true },
      { label: "Báo cáo PDF chi tiết + biểu đồ", included: true },
      { label: "Phân tích code chuyên sâu", included: true },
      { label: "Đánh giá theo rubric chi tiết", included: true },
      { label: "Hỗ trợ mentor 1-1", included: false },
    ],
  },
  {
    id: "vip",
    name: "VIP",
    tagline: "Trải nghiệm đầy đủ nhất",
    icon: "crown",
    monthly: 199000,
    yearly: 1990000,
    badge: "Cao cấp",
    cta: "Đăng ký VIP",
    features: [
      { label: "Tất cả tính năng Premium", included: true, highlight: true },
      { label: "Phân tích tài liệu AI cao cấp (GPT-4o)", included: true },
      { label: "Câu hỏi phản biện chuyên sâu theo ngành", included: true },
      { label: "Mock defense ưu tiên + record phiên", included: true },
      { label: "Báo cáo PDF chuyên nghiệp cho hội đồng", included: true },
      { label: "Phân tích code + đề xuất cải thiện", included: true },
      { label: "Đánh giá rubric + so sánh top sinh viên", included: true },
    ],
  },
];

export const FAQS = [
  {
    q: "Tôi có thể hủy gói Premium/VIP bất cứ lúc nào không?",
    a: "Có, bạn có thể hủy bất kỳ lúc nào trong phần Cài đặt tài khoản. Chúng tôi hoàn tiền theo chính sách trong vòng 7 ngày nếu chưa sử dụng hết quota.",
  },
  {
    q: "Sinh viên có được giảm giá không?",
    a: "Có! Với email .edu.vn hoặc thẻ sinh viên được xác minh, bạn được giảm thêm 20% cho mọi gói Premium/VIP.",
  },
  {
    q: "Tôi có thể nâng cấp từ Premium lên VIP không?",
    a: "Được, bạn chỉ trả phần chênh lệch theo thời gian còn lại của gói hiện tại.",
  },
  {
    q: "Thanh toán những phương thức nào?",
    a: "Chúng tôi hỗ trợ MoMo, ZaloPay, VNPay, thẻ ATM nội địa, Visa/Mastercard và chuyển khoản ngân hàng.",
  },
];

export function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value) + "đ";
}

export function planIcon(name: Plan["icon"]) {
  if (name === "sparkles") return <Sparkles className="w-6 h-6" />;
  if (name === "zap") return <Zap className="w-6 h-6" />;
  return <Crown className="w-6 h-6" />;
}