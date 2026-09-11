import { GraduationCap, Scale, BrainCircuit } from "lucide-react";

/**
 * ─────────────────────────────────────────────────────────────
 *  MOCK AI ROOM — Data & types (gói VIP 199k/tháng)
 *
 *  UI-first: mọi dữ liệu ở đây là mock/local. Khi có backend thật,
 *  thay các hàm mock bằng API call — giữ nguyên interface.
 * ─────────────────────────────────────────────────────────────
 */

/** Trạng thái membership của user (mock — sẽ thay bằng API /api/me/membership). */
export type MembershipPlan = "free" | "premium" | "vip";

/** Đọc trạng thái VIP từ localStorage (được set khi thanh toán thành công). */
export function getMembershipPlan(): MembershipPlan {
  if (typeof window === "undefined") return "free";
  try {
    const raw = localStorage.getItem("membership_plan");
    if (raw === "vip" || raw === "premium") return raw;
  } catch {}
  return "free";
}

/** Set cờ membership (dùng ở payment-success). */
export function setMembershipPlan(plan: MembershipPlan) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("membership_plan", plan);
  } catch {}
}

/** Một lượt hội thoại trong phòng Mock AI. */
export type MockMessage = {
  id: number;
  role: "user" | "mentor";
  content: string;
  time: string;
  /** Chỉ dùng cho AI — hiển thị gợi ý câu hỏi tiếp theo. */
  suggestions?: string[];
};

/** ─────────────────────────────────────────────────────────────
 *  AI COMMITTEE — 3 persona hội đồng cho MockRoomAI
 *  Mỗi persona đặt câu hỏi theo chuyên môn riêng.
 * ───────────────────────────────────────────────────────────── */

export type CommitteePersona = {
  key: string;
  name: string;
  title: string;
  description: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  greeting: string;
};

export const COMMITTEE_PERSONAS: CommitteePersona[] = [
  {
    key: "technical",
    name: "Giám khảo Kỹ thuật",
    title: "Technical Examiner",
    description: "Hỏi sâu về code, kiến trúc, database, performance.",
    color: "from-teal-500 to-cyan-400",
    icon: BrainCircuit,
    greeting:
      "Tôi sẽ kiểm tra kỹ phần kỹ thuật — kiến trúc, code, và các quyết định thiết kế. Em đã sẵn sàng chưa?",
  },
  {
    key: "business",
    name: "Giám khảo Nghiệp vụ",
    title: "Business Examiner",
    description: "Hỏi về tính thực tế, bài toán kinh doanh, trải nghiệm người dùng.",
    color: "from-violet-500 to-purple-500",
    icon: GraduationCap,
    greeting:
      "Tôi quan tâm đến giá trị thực tế của đồ án — bài toán nó giải quyết là gì, và liệu giải pháp có thực sự hữu ích không?",
  },
  {
    key: "strict",
    name: "Giám khảo Khó tính",
    title: "Strict Examiner",
    description: "Đặt câu hỏi dồn dập để thử thách tâm lý, soi lỗ hổng logic.",
    color: "from-amber-500 to-orange-500",
    icon: Scale,
    greeting:
      "Tôi sẽ thử thách mọi giả thuyết của em. Nếu em không chắc chắn, tốt nhất đừng nêu ra.",
  },
];

/**
 * Mock câu hỏi chất vấn từ từng persona hội đồng.
 * Dựa trên nội dung đồ án đã upload (context) + kiểu câu hỏi.
 */
export function mockCommitteeQuestion(
  personaKey: string,
  context: string,
  phase: "presentation" | "defense" | "feedback"
): string {
  const ctx = context.toLowerCase();

  if (phase === "presentation") {
    if (personaKey === "technical") {
      return `Em đã dùng công nghệ gì cho phần backend? Tại sao lại chọn FastAPI thay vì Node.js hoặc Spring Boot? Em có đo performance chưa?`;
    }
    if (personaKey === "business") {
      return `Đồ án của em giải quyết vấn đề gì cho người dùng cuối? Em đã khảo sát nhu cầu thực tế chưa?`;
    }
    return `Em có chắc chắn rằng giải pháp của em là tối ưu nhất? Nếu tôi hỏi "tại sao không dùng công nghệ X?", em sẽ trả lời thế nào?`;
  }

  if (phase === "defense") {
    if (personaKey === "technical") {
      return `Trong phần kiến trúc, em có xử lý được trường hợp race condition chứ? Và nếu database chết giữa chừng thì sao?`;
    }
    if (personaKey === "business") {
      return `Nếu startup của em có 10.000 người dùng đồng thời, chi phí server là bao nhiêu? Em đã tính ROI chưa?`;
    }
    return `Em nói phương pháp của mình "tốt hơn 30%" — em đo bằng cách nào, và kết quả cụ thể là bao nhiêu?`;
  }

  // feedback phase
  if (personaKey === "technical") {
    return `Về phần code: em nên refactor phần xử lý async, và thêm unit test cho ít nhất 80% coverage.`;
  }
  if (personaKey === "business") {
    return `Về tính thực tế: em cần bổ sung use case cho người dùng mới, và một flow onboarding rõ ràng hơn.`;
  }
  return `Tổng thể: em cần chuẩn bị kịch bản demo chạy offline, và luyện trả lời cho 5 câu hỏi khó nhất.`;
}

/** Gợi ý câu hỏi tiếp theo hiển thị dưới mỗi câu trả lời của hội đồng AI. */
export function mockSuggestions(personaKey: string): string[] {
  if (personaKey === "technical")
    return ["Giải thích kiến trúc hệ thống", "Đo performance thế nào?", "Xử lý lỗi ra sao?"];
  if (personaKey === "business")
    return ["Bài toán giải quyết gì?", "Khảo sát người dùng chưa?", "Tính ROI thế nào?"];
  return ["Trả lời câu 1", "Trả lời câu 2", "Trả lời câu 3"];
}

/**
 * Mock báo cáo đánh giá sau buổi mock.
 */
export type MockReport = {
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  actionItems: string[];
  rubricScores: { criterion: string; score: number; max: number }[];
};

export function mockMockReport(context: string): MockReport {
  return {
    score: 78,
    strengths: [
      "Trình bày rõ ràng, logic chặt chẽ",
      "Kiến trúc hệ thống được thiết kế tốt",
      "Câu trả lời có căn cứ số liệu",
    ],
    weaknesses: [
      "Thiếu benchmark so với các nghiên cứu tương tự",
      "Chưa chuẩn bị kịch bản demo offline",
      "Tốc độ nói nhanh khi bị hỏi khó",
    ],
    actionItems: [
      "Bổ sung so sánh với 2-3 nghiên cứu liên quan",
      "Luyện lại demo với kịch bản lỗi kết nối",
      "Tập thở sâu và chậm lại khi trả lời câu hỏi khó",
    ],
    rubricScores: [
      { criterion: "Kiến trúc & Thiết kế", score: 8, max: 10 },
      { criterion: "Triển khai & Code", score: 7, max: 10 },
      { criterion: "Kết quả & Đánh giá", score: 6, max: 10 },
      { criterion: "Trình bày & Bảo vệ", score: 9, max: 10 },
    ],
  };
}
