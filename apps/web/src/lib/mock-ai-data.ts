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
      "Tôi sẽ kiểm tra kỹ phần kỹ thuật — kiến trúc, code, và các quyết định thiết kế. Em đã sẵn sàng chưa? Nhớ: tôi không muốn nghe những câu trả lời chung chung, tôi muốn thấy code và số liệu thực tế.",
  },
  {
    key: "business",
    name: "Giám khảo Nghiệp vụ",
    title: "Business Examiner",
    description: "Hỏi về tính thực tế, bài toán kinh doanh, trải nghiệm người dùng.",
    color: "from-violet-500 to-purple-500",
    icon: GraduationCap,
    greeting:
      "Tôi quan tâm đến giá trị thực tế của đồ án — bài toán nó giải quyết là gì, và liệu giải pháp có thực sự hữu ích không? Đừng nói 'người dùng sẽ thích' — hãy chứng minh cho tôi thấy.",
  },
  {
    key: "strict",
    name: "Giám khảo Khó tính",
    title: "Strict Examiner",
    description: "Đặt câu hỏi dồn dập để thử thách tâm lý, soi lỗ hổng logic.",
    color: "from-amber-500 to-orange-500",
    icon: Scale,
    greeting:
      "Tôi sẽ thử thách mọi giả thuyễn của em. Nếu em không chắc chắn, tốt nhất đừng nêu ra. Tôi thích những câu trả lời được chứng minh, không phải những lập luận trống không.",
  },
];

/**
 * Mock câu hỏi chất vấn từ từng persona hội đồng.
 * Dựa trên nội dung đồ án đã upload (context) + kiểu câu hỏi.
 *
 * Mỗi câu hỏi được thiết kế để "phản biện" — đặt ra thắc mắc, thử thách giả thuyễn,
 * hoặc yêu cầu chứng minh cụ thể để học sinh phải bảo vệ quan điểm của mình.
 *
 * Mentor AI sẽ tham chiếu đến nội dung tài liệu thực sự để đặt câu hỏi cụ thể.
 */
export function mockCommitteeQuestion(
  personaKey: string,
  context: string,
  phase: "presentation" | "defense" | "feedback"
): string {
  const ctx = context.toLowerCase();

  // Helper: trích xuất tên công nghệ/kỹ thuật từ context để đặt câu hỏi cụ thể
  const extractTech = (ctx: string): string => {
    const techPatterns = [
      /fastapi/i, /nodejs/i, /spring boot/i, /django/i, /flask/i,
      /react/i, /vue/i, /angular/i, /next\.js/i, /svelte/i,
      /postgresql/i, /mysql/i, /mongodb/i, /redis/i, /elasticsearch/i,
      /docker/i, /kubernetes/i, /aws/i, /azure/i, /gcp/i,
      /machine learning/i, /deep learning/i, /ai/i, /nlp/i,
      /websocket/i, /graphql/i, /rest api/i, /microservice/i,
    ];
    for (const pattern of techPatterns) {
      const match = ctx.match(pattern);
      if (match) return match[0];
    }
    return "công nghệ em chọn";
  };

  // Helper: trích xuất tên bài toán/tính năng từ context
  const extractProblem = (ctx: string): string => {
    const problemPatterns = [
      /quản lý/i, /đào tạo/i, /học tập/i, /giáo dục/i, /bảo vệ/i,
      /phòng khám/i, /bệnh viện/i, /thuốc/i, /bệnh/i,
      /giao thông/i, /vận chuyển/i, /giao hàng/i, /đặt hàng/i,
      /tài chính/i, /ngân hàng/i, /đầu tư/i, /bảo hiểm/i,
      /bất động sản/i,
    ];
    for (const pattern of problemPatterns) {
      const match = ctx.match(pattern);
      if (match) return match[0];
    }
    return "bài toán em giải quyết";
  };

  const tech = extractTech(ctx);
  const problem = extractProblem(ctx);

  if (phase === "presentation") {
    if (personaKey === "technical") {
      return `Em đã chọn ${tech} cho phần backend — nhưng tại sao lại không dùng công nghệ khác? Nếu tôi hỏi: "trong trường hợp này, em có dùng dependency injection không?", em sẽ trả lời thế nào? Và nếu có 1000 request đồng thời, ${tech} có thực sự xử lý tốt hơn không?`;
    }
    if (personaKey === "business") {
      return `Em nói đồ án giải quyết "${problem}" — nhưng liệu người dùng có thực sự cần nó? Nếu tôi nói rằng công cụ này chỉ làm phức tạp hóa công việc hiện tại, em sẽ phản biện thế nào? Em đã khảo sát bao nhiêu người dùng thực sự chưa?`;
    }
    return `Em nói giải pháp của mình "tối ưu nhất" — nhưng tại sao không dùng công nghệ X mà mọi người đang dùng? Nếu tôi thách thức: "cách của em tốt hơn chỉ ở 1 khía cạnh, còn lại chưa chứng minh được", em sẽ thừa nhận hay phản biện?`;
  }

  if (phase === "defense") {
    if (personaKey === "technical") {
      return `Trong kiến trúc ${tech}, em có xử lý race condition chứ? Nhưng nếu tôi hỏi: "trong trường hợp 2 người cùng ghi vào 1 bản ghi, em có dùng optimistic locking chứ?" — nếu database chết giữa chừng, em có backup plan nào không? Em có chắc chắn rằng retry logic của mình không gây ra lỗi duplicate?`;
    }
    if (personaKey === "business") {
      return `Nếu "${problem}" của em có 10.000 người dùng đồng thời, chi phí server là bao nhiêu? Nhưng tôi muốn hỏi sâu hơn: "nếu chi phí tăng gấp 3 lần so với dự báo, em sẽ cắt giảm tính năng nào trước tiên?" — và ROI của em được tính trên cơ sở gì? Nếu tôi nói ROI chỉ là ước mơ, em sẽ thừa nhận hay phản biện?`;
    }
    return `Em nói phương pháp của mình "tốt hơn 30%" — em đo bằng cách nào? Kết quả cụ thể là bao nhiêu? Nhưng nếu tôi hỏi: "liệu 30% này có đủ ý nghĩa thực tế không, hay chỉ là số liệu mẫu vờ?" — em có sẵn sàng thừa nhận rằng độ mẫu của em chưa đủ lớn để kết luận chung chung không?`;
  }

  // feedback phase — đưa ra nhận xét "chân thành nhưng cay cú"
  if (personaKey === "technical") {
    return `Về phần code: em nên refactor phần xử lý async — vì code hiện tại có 3 điểm tiềm năng gây deadlock. Và thêm unit test cho ít nhất 80% coverage. Nhưng tôi phải nói: nếu em không biết async/await hoạt động thực sự như thế nào, thì refactor sẽ tạo ra lỗi tệ hơn.`;
  }
  if (personaKey === "business") {
    return `Về tính thực tế: em cần bổ sung use case cho người dùng mới, và một flow onboarding rõ ràng hơn. Nhưng thật sự thì, nếu người dùng mới không thấy giá trị ngay trong 30 giây đầu, họ sẽ bỏ cuộc — và em có chuẩn bị cho trường hợp đó chứ?`;
  }
  return `Tổng thể: em cần chuẩn bị kịch bản demo chạy offline, và luyện trả lời cho 5 câu hỏi khó nhất. Nhưng lưu ý: nếu em trả lời "tôi sẽ cải thiện sau này" quá nhiều, thì đồ án của em sẽ bị coi là chưa hoàn thiện — và trong thực tế, "sau này" thường là "không bao giờ".`;
}

/** Gợi ý câu hỏi tiếp theo hiển thị dưới mỗi câu trả lời của hội đồng AI. */
export function mockSuggestions(personaKey: string): string[] {
  if (personaKey === "technical")
    return ["Em có chắc dependency injection thực sự cần thiết ở đây?", "Nếu tôi thử tấn công race condition, em có thấy lỗ hổng không?", "Code của em có xử lý được lỗi network timeout chứ?"];
  if (personaKey === "business")
    return ["Nếu người dùng không trả tiền, em sẽ làm gì?", "ROI của em tính trên đâu?", "Nếu tôi nói giải pháp này không cần thiết, em sẽ phản biện thế nào?"];
  return ["Em có thừa nhận được điểm yếu không?", "Nếu tôi thách thức quan điểm của em, em sẽ thay đổi lập luận chứ?", "Em có sẵn sàng thừa nhận sai lầm không?"];
}

/**
 * Trích xuất thông tin từ tài liệu đã upload để mentor AI tham chiếu.
 * Trả về một đoạn tóm tắt ngắn gọn của nội dung tài liệu.
 */
export function extractContextSummary(context: string): string {
  if (!context || context.length < 50) return "chưa có nội dung tài liệu";
  // Lấy 500 ký tự đầu tiên làm tóm tắt
  const summary = context.substring(0, 500).replace(/\s+/g, " ").trim();
  return summary.length >= 100 ? summary + "..." : summary;
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
      "Thiếu benchmark so với các nghiên cứu tương tự — chỉ nêu ra số liệu mà không giải thích tại sao nó lại tốt hơn",
      "Chưa chuẩn bị kịch bản demo offline — nếu mạng down, em không thể trình bày được gì",
      "Tốc độ nói nhanh khi bị hỏi khó — điều này khiến người nghe khó theo kịp logic của em",
      "Câu trả lời quá chung chung khi bị hỏi về lỗ hổng bảo mật — chưa thừa nhận được giới hạn thực sự",
    ],
    actionItems: [
      "Bổ sung so sánh với 2-3 nghiên cứu liên quan, kèm phân tích tại sao giải pháp của em khác biệt",
      "Luyện lại demo với kịch bản lỗi kết nối — chuẩn bị câu trả lời cho 'hệ thống down'",
      "Tập thở sâu và chậm lại khi trả lời câu hỏi khó — đặc biệt khi bị thách thức về kiến thức sâu",
      "Chuẩn bị câu trả lời cho 5 câu hỏi khó nhất: bảo mật, scalability, cost, timeline, và failure case",
    ],
    rubricScores: [
      { criterion: "Kiến trúc & Thiết kế", score: 8, max: 10 },
      { criterion: "Triển khai & Code", score: 7, max: 10 },
      { criterion: "Kết quả & Đánh giá", score: 6, max: 10 },
      { criterion: "Trình bày & Bảo vệ", score: 9, max: 10 },
    ],
  };
}
