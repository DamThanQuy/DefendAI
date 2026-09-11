import {
  GraduationCap,
  Scale,
  BrainCircuit,
  Crown,
} from "lucide-react";

/**
 * ─────────────────────────────────────────────────────────────
 *  AI MENTOR ROOM — Data & types (gói VIP 199k/tháng)
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

/**
 * Khi user đăng ký gói VIP, tự động tạo 1 phòng "AI Mentor" mặc định.
 * Lưu danh sách phòng vào localStorage — sẽ thay bằng API khi có backend.
 */
export function createVipMentorRoom(userId?: string): MentorRoom {
  const room: MentorRoom = {
    id: `room-vip-${userId || "user"}-${Date.now()}`,
    personaKey: "advisor",
    topic: "Phòng Mentor AI VIP",
    lastActive: "Vừa tạo",
    messageCount: 0,
  };
  // Lưu vào localStorage để hiển thị ở sidebar
  try {
    const existing = JSON.parse(localStorage.getItem("mentor_rooms") || "[]");
    localStorage.setItem("mentor_rooms", JSON.stringify([room, ...existing]));
  } catch {}
  return room;
}

/** Đọc danh sách phòng mentor của user (từ localStorage). */
export function getMentorRooms(): MentorRoom[] {
  if (typeof window === "undefined") return MOCK_ROOMS;
  try {
    const raw = localStorage.getItem("mentor_rooms");
    if (raw) return JSON.parse(raw);
  } catch {}
  return MOCK_ROOMS;
}

/** Mentor AI có nhiều "chuyên gia" — mỗi người một phong cách hỏi/đáp. */
export type MentorPersona = {
  key: string;
  name: string;
  title: string;
  description: string;
  color: string; // gradient class cho avatar
  icon: React.ComponentType<{ className?: string }>;
  greeting: string;
  quickActions: { label: string; prompt: string }[];
};

export const MENTOR_PERSONAS: MentorPersona[] = [
  {
    key: "advisor",
    name: "Cô Lan",
    title: "Giảng viên hướng dẫn",
    description: "Định hướng đề tài, chốt cấu trúc đồ án, gợi mở ý tưởng.",
    color: "from-teal-500 to-cyan-400",
    icon: GraduationCap,
    greeting:
      "Chào em! Cô đã xem qua tiến độ đồ án của em. Hôm nay em muốn trao đổi về phần nào — đề tài, cấu trúc hay phương pháp?",
    quickActions: [
      { label: "Xem lại đề cương", prompt: "Cô ơi, em muốn cô xem lại đề cương và góp ý cấu trúc chương." },
      { label: "Chọn hướng đi", prompt: "Đề tài của em có 2 hướng tiếp cận, cô giúp em phân tích ưu nhược điểm từng hướng." },
      { label: "Lên kế hoạch", prompt: "Cô giúp em lập kế hoạch hoàn thành đồ án trong 6 tuần còn lại được không ạ?" },
    ],
  },
  {
    key: "examiner",
    name: "TS. Minh",
    title: "Hội đồng phản biện",
    description: "Giả lập câu hỏi chất vấn, soi lỗ hổng, luyện trả lời xoáy.",
    quickActions: [
      { label: "Chất vấn chương 3", prompt: "Thầy chất vấn em về phần thiết kế ở chương 3 đi ạ, em muốn luyện trả lời." },
      { label: "Soi lỗ hổng", prompt: "Thầy xem giúp em phần methodology còn lỗ hổng nào không?" },
      { label: "Luyện phản biện", prompt: "Thầy giả lập một vòng chất vấn khó về kết quả thực nghiệm của em." },
    ],
    color: "from-amber-500 to-orange-500",
    icon: Scale,
    greeting:
      "Tôi là Minh. Sẵn sàng chưa? Tôi sẽ hỏi như hội đồng thật — trả lời dứt khoát, có căn cứ.",
  },
  {
    key: "engineer",
    name: "Anh Khoa",
    title: "Chuyên gia kỹ thuật",
    description: "Kiến trúc hệ thống, tối ưu code, deployment thực chiến.",
    color: "from-violet-500 to-purple-500",
    icon: BrainCircuit,
    greeting:
      "Chào bạn! Mình có thể đi sâu vào kiến trúc, performance, hoặc review cụ thể đoạn code nào đó. Bạn cần gì?",
    quickActions: [
      { label: "Review kiến trúc", prompt: "Anh review giúp em kiến trúc hệ thống hiện tại và gợi ý cải thiện scalability." },
      { label: "Tối ưu query", prompt: "Em có vài query chậm, anh giúp em phân tích và tối ưu với." },
      { label: "Chuẩn bị demo", prompt: "Sắp demo đồ án, anh gợi ý em chuẩn bị kịch bản demo và các rủi ro kỹ thuật." },
    ],
  },
];

/** Một lượt hội thoại trong phòng mentor. */
export type MentorMessage = {
  id: number;
  role: "user" | "mentor";
  content: string;
  time: string;
  /** Chỉ dùng cho mentor — hiển thị gợi ý câu hỏi tiếp theo. */
  suggestions?: string[];
};

/** Chủ đề phòng — mỗi mentor có thể có nhiều "phòng" theo chủ đề. */
export type MentorRoom = {
  id: string;
  personaKey: string;
  topic: string;
  lastActive: string;
  messageCount: number;
};

/** Danh sách phòng mock — sẽ thay bằng GET /api/ai-mentor/rooms. */
export const MOCK_ROOMS: MentorRoom[] = [
  { id: "room-advisor-1", personaKey: "advisor", topic: "Đề cương & cấu trúc đồ án", lastActive: "2 giờ trước", messageCount: 24 },
  { id: "room-examiner-1", personaKey: "examiner", topic: "Luyện chất vấn chương 3", lastActive: "Hôm qua", messageCount: 12 },
  { id: "room-engineer-1", personaKey: "engineer", topic: "Kiến trúc & scalability", lastActive: "3 ngày trước", messageCount: 8 },
];

/**
 * Mock streaming response — mô phỏng LLM trả lời word-by-word.
 * Khi có backend: thay bằng fetch POST /api/ai-mentor/{room}/chat/stream
 * với pattern SSE giống WorkspaceChat (meta/status/delta/done/error).
 */
export function mockMentorReply(personaKey: string, question: string): string {
  const q = question.toLowerCase();
  const advisor = personaKey === "advisor";
  const examiner = personaKey === "examiner";

  if (q.includes("đề cương") || q.includes("cấu trúc")) {
    return `**Phân tích đề cương của em:**\n\n1. **Chương 1 — Tổng quan** đang ổn, nhưng em nên nêu rõ *problem statement* ngay đoạn mở đầu thay vì để cuối chương.\n2. **Chương 2 — Cơ sở lý thuyết** khá dài (18 trang). Hội đồng thường hỏi *"lý thuyết nào thực sự dùng đến"* — em nên rút gọn còn 10-12 trang, tập trung vào các thuật toán em thực sự triển khai.\n3. **Chương 3 — Thiết kế** thiếu sơ đồ sequence cho luồng chính. Em bổ sung thêm 2-3 sơ đồ (use case, sequence, deployment) sẽ chắc hơn nhiều.\n\n**Việc cần làm ngay:**\n- [ ] Rút gọn chương 2\n- [ ] Bổ sung sơ đồ sequence\n- [ ] Viết lại problem statement ở chương 1\n\nEm muốn cô đi sâu vào mục nào trước?`;
  }
  if (q.includes("kế hoạch") || q.includes("plan")) {
    return `**Kế hoạch 6 tuần hoàn thành đồ án:**\n\n| Tuần | Mục tiêu | Kết quả giao |\n|------|-----------|---------------|\n| 1-2 | Hoàn thiện thiết kế | Sơ đồ + spec API |\n| 3-4 | Code tính năng chính | Demo chạy được |\n| 5 | Test + viết báo cáo | Bản nháp chương 4-5 |\n| 6 | Slide + luyện bảo vệ | Buổi mock defense |\n\n⚠️ **Lưu ý:** tuần 3-4 là giai đoạn rủi ro cao nhất — code thường chậm hơn dự kiến 30%. Em nên buffer thêm 3-4 ngày.\n\nEm muốn cô giúp phân tích rủi ro chi tiết từng tuần không?`;
  }
  if (examiner || q.includes("chất vấn") || q.includes("lỗ hổng")) {
    return `Được. Tôi sẽ hỏi như hội đồng thật — **3 câu hỏi xoáy nhất** với phần này:\n\n> **Câu 1:** Em nói phương pháp X "hiệu quả hơn" Y — hiệu quả dựa trên tiêu chí nào, đo bằng thí nghiệm nào, và kết quả cụ thể là gì?\n\n> **Câu 2:** Nếu dữ liệu đầu vào gấp 10 lần, hệ thống của em còn đáp ứng được không? Em đã đo ở quy mô nào?\n\n> **Câu 3:** Em có so sánh với các nghiên cứu liên quan không? Điểm khác biệt cốt lõi của em so với họ là gì?\n\n---\n\nChọn một câu và trả lời thử đi. Tôi sẽ phản biện như hội đồng thật — và tin tôi đi, **họ sẽ hỏi xoáy hơn tôi nhiều**.`;
  }
  if (q.includes("kiến trúc") || q.includes("scalability") || q.includes("query")) {
    return `**Nhận xét kiến trúc hiện tại:**\n\n\`\`\`\nClient → Next.js (SSR) → FastAPI → PostgreSQL + Redis\n                        ↘ Worker (AI jobs) → MinIO\n\`\`\`\n\nĐiểm mạnh: tách worker khỏi API, dùng queue async cho job AI.\n\n**3 điểm cần cải thiện:**\n1. **Connection pooling** — mỗi worker mở connection riêng, nên dùng shared pool.\n2. **Caching** — kết quả AI lặp lại với cùng input nên cache được bằng Redis (TTL 24h).\n3. **Rate limiting** — chưa thấy lớp giới hạn request ở API gateway.\n\nEm muốn mình đi sâu vào điểm nào?`;
  }
  if (advisor) {
    return `Cô hiểu điều em đang trao đổi. Trước khi đi vào chi tiết, cô muốn em trả lời 2 câu hỏi để định hướng đúng:\n\n1. **Mục tiêu** của phần này trong đồ án là gì — chứng minh tính đúng đắn, hay chứng minh tính khả thi?\n2. Em đã có **kết quả thực nghiệm** chưa, hay mới dừng ở thiết kế?\n\nTrả lời xong cô sẽ góp ý cụ thể hơn em nhé.`;
  }
  return `Câu hỏi hay. Dựa trên ngữ cảnh đồ án của em, mình gợi ý thế này:\n\n1. **Bắt đầu từ kết quả** — trình bày cái em đã làm được trước, hội đồng thích thấy sản phẩm thật.\n2. **Chuẩn bị số liệu** — mọi tuyên bố "hiệu quả" đều cần benchmark cụ thể.\n3. **Luyện kịch bản xấu nhất** — nếu demo fail giữa chừng, em sẽ nói gì?\n\nEm muốn mình mock thử kịch bản xấu nhất đó không?`;
}

/** Gợi ý câu hỏi tiếp theo hiển thị dưới mỗi câu trả lời. */
export function mockSuggestions(personaKey: string): string[] {
  if (personaKey === "examiner")
    return ["Trả lời câu 1", "Trả lời câu 2", "Trả lời câu 3"];
  if (personaKey === "engineer")
    return ["Đi sâu connection pooling", "Thiết kế cache strategy", "Vẽ lại sơ đồ kiến trúc"];
  return ["Đi sâu chương 2", "Phân tích rủi ro kế hoạch", "Xem mẫu slide bảo vệ"];
}

/** Badge hiển thị trên avatar mentor khi đang "hoạt động". */
export const MENTOR_ONLINE_LABEL = "Trực tuyến 24/7";

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
