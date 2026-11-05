/**
 * Product Tour — cấu hình các bước + helpers trạng thái "đã xem tour".
 *
 * Trigger: markTourPending() chỉ được gọi DUY NHẤT ở nhánh thành công của
 * handleRegister (AuthSlider.tsx) — backend chỉ tạo tài khoản student qua form
 * đăng ký (auth.py gán role student mặc định), còn AuthResponse không có cờ
 * is_new_user nên không thể phân biệt new/existing từ login/Google.
 *
 * Persistence: 2 key localStorage per-userId (clearSession trong lib/auth.ts
 * không xoá 2 key này nên chúng sống sót qua đăng xuất/đăng nhập lại):
 * - `defendai_tour_pending_<userId>` — đặt lúc signup, xoá khi tour đóng.
 * - `defendai_tour_done_<userId>` — ghi ở cả hoàn thành lẫn skip.
 * Gate chỉ mở tour khi pending && !done → user cũ (không bao giờ có pending)
 * và lần xem sau (đã done) đều không dính.
 *
 * ⚠️ HYDRATION (rule bắt buộc theo useAuth.ts:25-31): mọi hàm đọc/ghi
 * localStorage chỉ được gọi trong useEffect / event handler (client-side),
 * KHÔNG gọi trong useState initializer hay lúc render đầu. Các hàm dưới đây
 * có guard `typeof window === "undefined"` để an toàn nếu vô tình chạy SSR.
 */

export type TourDoneStatus = "completed" | "skipped";

export interface TourStep {
  /** Thứ tự bước (1-based, chỉ để tham chiếu — mảng đã xếp đúng thứ tự). */
  order: number;
  /** Route nơi bước này diễn ra — ProductTour tự điều hướng khi bước active có route khác hiện tại. */
  route: string;
  title: string;
  body: string;
  /** CSS selector của element được spotlight; rỗng ("") → card giữa màn hình. */
  target: string;
  /** Vị trí tooltip ưu tiên; component tự flip sang phía đối diện nếu thiếu chỗ. */
  placement: "top" | "bottom";
}

const PENDING_PREFIX = "defendai_tour_pending_";
const DONE_PREFIX = "defendai_tour_done_";

function pendingKey(userId: number | string): string {
  return `${PENDING_PREFIX}${userId}`;
}

function doneKey(userId: number | string): string {
  return `${DONE_PREFIX}${userId}`;
}

/** Đặt cờ "chờ xem tour" — gọi DUY NHẤT ngay sau khi đăng ký thành công. */
export function markTourPending(userId: number | string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(pendingKey(userId), "1");
  } catch {
    // localStorage bị chặn (vd Safari private mode) → user bỏ qua tour, không crash signup.
  }
}

export function isTourPending(userId: number | string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(pendingKey(userId)) !== null;
  } catch {
    return false;
  }
}

export function isTourDone(userId: number | string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(doneKey(userId)) !== null;
  } catch {
    return false;
  }
}

/** Ghi cờ "đã xem" (completed hoặc skipped) và xoá pending — gọi khi tour đóng. */
export function markTourDone(userId: number | string, status: TourDoneStatus): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(doneKey(userId), status);
    localStorage.removeItem(pendingKey(userId));
  } catch {
    // ignore — như trên.
  }
}

/**
 * Kịch bản tour 7 bước trên 2 route (/documents → /workspaces — ProductTour tự
 * điều hướng khi đổi bước, kể cả bấm Quay lại). /documents luôn render đủ
 * anchor mở đầu (nút upload, sidebar link); /workspaces có nút Tạo workspace +
 * cùng sidebar/topbar (AppShell) cho các bước còn lại.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    order: 1,
    route: "/documents",
    title: "Chào mừng đến với GraduAI! 🎉",
    body: "Mình sẽ dẫn bạn đi nhanh qua các khu vực chính của app — chưa tới 1 phút thôi, bắt đầu nhé?",
    target: "",
    placement: "bottom",
  },
  {
    order: 2,
    route: "/documents",
    title: "Tải lên tài liệu của bạn",
    body: "Bấm nút này để tải đồ án lên (PDF, DOCX, PPTX, ZIP) — GraduAI sẽ đọc và phân tích giúp bạn.",
    target: '[data-testid="documents-upload-button"]',
    placement: "bottom",
  },
  {
    order: 3,
    route: "/documents",
    title: "Sắp xếp gọn với Workspace",
    body: "Mỗi đồ án một workspace: gom tài liệu và mã nguồn vào một chỗ để AI đối chiếu yêu cầu với code. Bấm Tiếp theo để mình dẫn bạn sang thẳng trang Workspace nhé!",
    target: '[data-testid="sidebar-link-/workspaces"]',
    placement: "bottom",
  },
  {
    order: 4,
    route: "/workspaces",
    title: "Thêm tài liệu vào workspace",
    body: "Ví dụ nhé: bấm “+ Tạo workspace” cho đề tài của bạn, rồi vào trong workspace bấm “+ Thêm tài liệu” để gắn các file đã tải lên — AI sẽ đối chiếu yêu cầu đề tài với đúng tài liệu và code của workspace đó.",
    target: '[data-testid="workspaces-create-button"]',
    placement: "bottom",
  },
  {
    order: 5,
    route: "/workspaces",
    title: "Luyện phản biện tại Mock Room",
    body: "Vào Mock Room để đối mặt câu hỏi hội đồng AI, hoặc đặt lịch luyện cùng mentor thật ở mục Đặt lịch.",
    target: '[data-testid="sidebar-link-/mock-room"]',
    placement: "bottom",
  },
  {
    order: 6,
    route: "/workspaces",
    title: "Theo dõi tiến độ của bạn",
    body: "Xem báo cáo điểm số và các buổi luyện tập để biết mình đang tiến bộ ở đâu.",
    target: '[data-testid="sidebar-link-/report"]',
    placement: "bottom",
  },
  {
    order: 7,
    route: "/workspaces",
    title: "Luôn có người giúp bạn 🚀",
    body: "Quên cách dùng chỗ nào? Bấm lại nút Trợ giúp này bất cứ lúc nào để xem lại hướng dẫn từ đầu. Chúc bạn bảo vệ thành công! 🎓",
    target: '[data-testid="topbar-help"]',
    placement: "bottom",
  },
];

/**
 * Sự kiện "xem lại hướng dẫn" — nút Trợ giúp trên topbar (AppShell) phát khi
 * bấm; ProductTourGate nghe và mở lại tour từ bước 1 (bỏ qua điều kiện
 * pending/done — replay là hành động chủ động của user).
 */
export const TOUR_REPLAY_EVENT = "defendai:replay-tour";

/** Route mở tour (bước 1) — nút Trợ giúp điều hướng về đây trước khi phát sự kiện. */
export const TOUR_START_ROUTE = TOUR_STEPS[0].route;
