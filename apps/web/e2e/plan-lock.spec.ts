import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test Suite: Khoá tính năng theo gói (API được mock, không gọi AI hay PayOS thật).
 *
 * Bao gồm 15 kịch bản:
 * 1. Free: Phòng Mock AI bị mờ, nút "Mua gói" chuyển sang bảng giá.
 * 2. Premium: Phòng Mock AI bị mờ, nút "Nâng cấp gói".
 * 3. VIP hết hạn: báo gói đã hết hạn, Phòng Mock AI bị khoá dù hồ sơ còn ghi VIP.
 * 4. VIP: vào được Phòng Mock AI.
 * 5. Có vé khảo sát: vào được Phòng Mock AI.
 * 6. Đã khoá nhưng có phiên cũ: vẫn xem lại được, phiên chỉ còn đọc.
 * 7. Phiên mở bằng vé: tin nhắn gửi kèm mã phiên.
 * 8. Đặt lịch: tài khoản Free còn lượt thấy số lượt và đặt được.
 * 9. Đặt lịch: hết lượt thì form bị mờ, lịch cũ vẫn hiện.
 * 10. Code Review: Free bị khoá, không gọi được quét; lịch sử vẫn mở.
 * 11. Code Review: Premium dùng được.
 * 12. Báo cáo: gói chưa có rubric chi tiết thì phần điểm bị mờ.
 * 13. Server không trả quyền (API cũ, lỗi mạng): không khoá nhầm người đang là VIP.
 * 14. Chưa nhận vé: thẻ bị khoá có nút góp ý nhận vé, bấm vào mở khảo sát.
 * 15. Đã nhận vé và dùng hết: không mời góp ý nhận vé nữa.
 */

const STUDENT = { id: 999, email: "student@defendai.dev", full_name: "Student", is_active: true, roles: ["student"], profile_data: {} as Record<string, unknown>, major: "Khác" };
const VIP_MEMBERSHIP = { plan: "vip", cycle: "monthly", status: "active", expires_at: "2099-01-01T00:00:00" };

type Access = {
  plan: "free" | "premium" | "vip";
  expired_plan: string | null;
  features: { mock_ai: boolean; code_review: boolean; rubric: boolean; mentor_booking: boolean };
  free_mentor_bookings_left: number;
};

const FREE: Access = { plan: "free", expired_plan: null, features: { mock_ai: false, code_review: false, rubric: false, mentor_booking: true }, free_mentor_bookings_left: 1 };
const FREE_USED: Access = { ...FREE, features: { ...FREE.features, mentor_booking: false }, free_mentor_bookings_left: 0 };
const PREMIUM: Access = { plan: "premium", expired_plan: null, features: { mock_ai: false, code_review: true, rubric: true, mentor_booking: true }, free_mentor_bookings_left: 1 };
const VIP: Access = { plan: "vip", expired_plan: null, features: { mock_ai: true, code_review: true, rubric: true, mentor_booking: true }, free_mentor_bookings_left: 1 };
const EXPIRED_VIP: Access = { ...FREE_USED, expired_plan: "VIP" };

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

function mockJwt(userId: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: String(userId), exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
}

type Options = { access?: Access | null; profile?: Record<string, unknown>; sessions?: unknown[]; bookings?: unknown[] };

async function setup(page: Page, options: Options = {}) {
  const user = { ...STUDENT, profile_data: options.profile ?? {} };
  await page.addInitScript(({ token, cached }) => {
    localStorage.setItem("access_token", token);
    localStorage.setItem("refresh_token", "x");
    localStorage.setItem("user", JSON.stringify(cached));
    localStorage.setItem(`defendai_tour_done_${cached.id}`, "completed");
  }, { token: mockJwt(user.id), cached: user });

  await page.route("**/api/**", (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route("**/api/auth/me", (route) => route.fulfill(json(user)));
  await page.route("**/api/feedback/user-context", (route) =>
    route.fulfill(json({ current_plan: "free", has_submitted: false, eligible_for_feedback: false, detected_features: [], feature_counts: {}, mock_ai_trial_tickets: 0 }))
  );
  await page.route("**/api/payment/account", (route) =>
    route.fulfill(json({ wallet: { balance: 0, currency: "VND" }, subscription: null, ...(options.access === null ? {} : { access: options.access ?? FREE }) }))
  );
  await page.route("**/api/mock-qa/sessions", (route) => route.fulfill(json({ items: options.sessions ?? [] })));
  await page.route("**/api/bookings/mine", (route) => route.fulfill(json(options.bookings ?? [])));
  await page.route("**/api/auth/mentors", (route) => route.fulfill(json([])));
  await page.route("**/api/subscriptions", (route) => route.fulfill(json({ plans: [] })));
}

const expectGoesToPricing = async (page: Page) => {
  await page.getByTestId("upgrade-link").first().click();
  await page.waitForURL((url) => url.pathname === "/pricing", { timeout: 15000 });
};

test.describe("Phòng Mock AI", () => {
  test("Kịch bản 1: Free: thẻ bị mờ, bấm Mua gói sang bảng giá", async ({ page }) => {
    await setup(page);
    await page.goto("/mock-room");

    const card = page.getByTestId("mock-ai-locked");
    await expect(card).toContainText("chỉ dành cho gói VIP");
    await expect(page.getByTestId("upgrade-link").first()).toHaveText("Mua gói");
    await expect(card.getByText("Xem lại phiên đã lưu")).toHaveCount(0);

    // Bấm vào thẻ không vào được phòng.
    await card.getByRole("heading", { name: "Phòng Mock AI" }).click({ force: true });
    await expect(page).toHaveURL(/\/mock-room$/);

    await expectGoesToPricing(page);
  });

  test("Kịch bản 2: Premium: nút Nâng cấp gói", async ({ page }) => {
    await setup(page, { access: PREMIUM, profile: { membership: { ...VIP_MEMBERSHIP, plan: "premium" } } });
    await page.goto("/mock-room");

    await expect(page.getByTestId("mock-ai-locked")).toBeVisible();
    await expect(page.getByTestId("upgrade-link").first()).toHaveText("Nâng cấp gói");
    await expectGoesToPricing(page);
  });

  test("Kịch bản 3: VIP hết hạn: bị khoá dù hồ sơ còn ghi VIP", async ({ page }) => {
    await setup(page, { access: EXPIRED_VIP, profile: { membership: { ...VIP_MEMBERSHIP, expires_at: "2020-01-01T00:00:00" } } });
    await page.addInitScript(() => localStorage.setItem("membership_plan", "vip"));
    await page.goto("/mock-room");

    await expect(page.getByTestId("mock-ai-locked")).toContainText("Gói VIP của bạn đã hết hạn");
    await expect(page.getByTestId("upgrade-link").first()).toHaveText("Mua gói");
    await expect(page.getByTestId("mentor-booking-locked")).toContainText("Gói VIP của bạn đã hết hạn");
    // Cờ cũ trong trình duyệt cũng phải được dọn.
    await expect.poll(() => page.evaluate(() => localStorage.getItem("membership_plan"))).toBeNull();
  });

  test("Kịch bản 4: VIP vào được phòng", async ({ page }) => {
    await setup(page, { access: VIP, profile: { membership: VIP_MEMBERSHIP } });
    await page.goto("/mock-room");

    await expect(page.getByTestId("mock-ai-locked")).toHaveCount(0);
    await page.getByRole("heading", { name: "Phòng Mock AI" }).click();
    await page.waitForURL((url) => url.pathname === "/mock-room-ai", { timeout: 15000 });
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/mock-room-ai$/);
  });

  test("Kịch bản 5: Có vé khảo sát vào được phòng", async ({ page }) => {
    await setup(page, { profile: { mock_ai_trial_tickets: 1 } });
    await page.goto("/mock-room");

    await expect(page.getByText("Có 1 vé trải nghiệm", { exact: true })).toBeVisible();
    await expect(page.getByTestId("mock-ai-locked")).toHaveCount(0);
    await page.getByRole("heading", { name: "Phòng Mock AI" }).click();
    await page.waitForURL((url) => url.pathname === "/mock-room-ai", { timeout: 15000 });
  });

  test("Kịch bản 6: Đã khoá nhưng có phiên cũ: chỉ xem lại được", async ({ page }) => {
    const session = { id: 7, document_id: null, title: "Phiên cũ", message_count: 2, preview: "Em xin trình bày", created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00" };
    await setup(page, { access: EXPIRED_VIP, sessions: [session] });
    await page.route("**/api/mock-qa/sessions/7", (route) =>
      route.fulfill(json({ ...session, messages: [{ role: "user", content: "Em xin trình bày", time: "" }, { role: "assistant", content: "Câu hỏi", time: "" }], can_chat: false }))
    );
    let chats = 0;
    await page.route("**/api/mock-qa/chat", (route) => {
      chats += 1;
      return route.fulfill(json({ reply: "x" }));
    });
    await page.goto("/mock-room");

    await page.getByTestId("mock-ai-locked").getByText("Xem lại phiên đã lưu").click();
    await page.waitForURL((url) => url.pathname === "/mock-room-ai", { timeout: 15000 });
    await page.getByTitle(/Tiếp tục/).first().click();

    await expect(page.getByTestId("session-read-only")).toBeVisible();
    await expect(page.getByRole("textbox")).toBeDisabled();
    expect(chats).toBe(0);
  });

  test("Kịch bản 7: Phiên mở bằng vé: tin nhắn gửi kèm mã phiên", async ({ page }) => {
    await setup(page, { profile: { mock_ai_trial_tickets: 1 } });
    await page.route("**/api/mock-qa/sessions", (route) =>
      route.request().method() === "POST"
        ? route.fulfill(json({ id: 55, document_id: null, title: "Phiên", message_count: 0, preview: "", created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00", remaining_tickets: 0 }))
        : route.fulfill(json({ items: [] }))
    );
    await page.route("**/api/mock-qa/sessions/55", (route) => route.fulfill(json({ success: true })));
    const bodies: { session_id?: number }[] = [];
    await page.route("**/api/mock-qa/chat", (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill(json({ reply: "Câu hỏi phản biện" }));
    });
    await page.goto("/mock-room-ai");

    await page.getByRole("button", { name: /Vào phòng hỏi tự do/ }).click();
    await page.getByRole("textbox").fill("Em xin trình bày đề tài");
    await page.getByTitle("Gửi câu trả lời").click();

    await expect(page.getByText("Câu hỏi phản biện")).toBeVisible();
    expect(bodies[0].session_id).toBe(55);
  });

  test("Kịch bản 13: Server không trả quyền: không khoá nhầm người đang là VIP", async ({ page }) => {
    await setup(page, { access: null, profile: { membership: VIP_MEMBERSHIP } });
    await page.goto("/mock-room");

    await expect(page.getByRole("heading", { name: "Phòng Mock AI" })).toBeVisible();
    await expect(page.getByTestId("mock-ai-locked")).toHaveCount(0);
  });
});

test.describe("Vé khảo sát", () => {
  test("Kịch bản 14: Chưa nhận vé: bấm góp ý mở khảo sát", async ({ page }) => {
    await setup(page);
    await page.goto("/mock-room");

    await page.getByTestId("earn-ticket").click();

    await expect(page.getByText("Khảo sát Trải nghiệm & Nhận Quà")).toBeVisible();
    await expect(page).toHaveURL(/\/mock-room$/);
  });

  test("Kịch bản 15: Đã nhận vé và dùng hết: không mời góp ý nữa", async ({ page }) => {
    await setup(page, { profile: { mock_ai_trial_tickets: 0, feedback_status: { submitted: true, reward_ticket_granted: true } } });
    await page.goto("/mock-room");

    await expect(page.getByTestId("mock-ai-locked")).toBeVisible();
    await expect(page.getByTestId("upgrade-link").first()).toHaveText("Mua gói");
    await expect(page.getByTestId("earn-ticket")).toHaveCount(0);
  });
});

test.describe("Đặt lịch Mock Room với mentor", () => {
  const BOOKING = { id: 1, student_id: STUDENT.id, mentor_id: 5, mentor_name: "Mentor A", title: "Buổi mock đầu tiên", status: "confirmed", meeting_id: 9, proposed_time: "2099-01-01T03:00:00", confirmed_time: "2099-01-01T03:00:00", created_at: "2026-01-01T00:00:00", updated_at: "2026-01-01T00:00:00", invited_students: [] };

  test("Kịch bản 8: Còn lượt: thấy số lượt, form dùng được", async ({ page }) => {
    await setup(page);
    await page.goto("/bookings");

    await expect(page.getByTestId("free-booking-note")).toContainText("1 lịch");
    await expect(page.getByTestId("plan-lock")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gửi yêu cầu" })).toBeEnabled();
  });

  test("Kịch bản 9: Hết lượt: form bị mờ, lịch cũ vẫn hiện", async ({ page }) => {
    await setup(page, { access: FREE_USED, bookings: [BOOKING] });
    await page.goto("/bookings");

    await expect(page.getByTestId("plan-lock")).toContainText("Đã hết lượt đặt lịch miễn phí");
    await expect(page.getByTestId("free-booking-note")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gửi yêu cầu" })).toHaveCount(0);
    await expect(page.getByTestId("plan-lock").locator("[inert]")).toHaveCount(1);
    await expect(page.getByText("Buổi mock đầu tiên")).toBeVisible();
    await expectGoesToPricing(page);
  });
});

test.describe("Code Review", () => {
  test("Kịch bản 10: Free bị khoá, lịch sử vẫn mở", async ({ page }) => {
    await setup(page);
    let scans = 0;
    await page.route("**/api/code/scan", (route) => {
      scans += 1;
      return route.fulfill(json({ success: true }));
    });
    await page.goto("/code-review");

    await expect(page.getByTestId("plan-lock")).toContainText("Phân tích code chuyên sâu");
    await expect(page.getByRole("button", { name: /Chọn file ZIP\/RAR/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Chạy Code Review/ })).toBeDisabled();
    await expect(page.getByRole("link", { name: /Lịch sử/ })).toBeVisible();
    expect(scans).toBe(0);
    await expectGoesToPricing(page);
  });

  test("Kịch bản 11: Premium dùng được", async ({ page }) => {
    await setup(page, { access: PREMIUM });
    await page.goto("/code-review");

    await expect(page.getByRole("button", { name: /Chọn file ZIP\/RAR/ })).toBeEnabled();
    await expect(page.getByTestId("plan-lock")).toHaveCount(0);
  });
});

test("Kịch bản 12: Báo cáo: gói chưa có rubric chi tiết thì phần điểm bị mờ", async ({ page }) => {
  await setup(page);
  const item = { code: "srs", label: "Đặc tả yêu cầu", weight: 1, mark: null, ai_mark: null, reviews: [] };
  await page.route("**/api/reports/5", (route) =>
    route.fulfill(
      json({
        id: 5,
        title: "Báo cáo thử",
        source: "mentor",
        status: "completed",
        generation_status: "ready",
        generation_error: null,
        created_at: "2026-01-01T00:00:00",
        updated_at: "2026-01-01T00:00:00",
        meeting_id: 1,
        mock_session_id: null,
        workspace: null,
        document: null,
        rubric: { key: "defense_sep490", name: "SEP490", version: 1, scale_max: 10, pass_mark: 5, groups: [{ group: "TDA", label: "TDA" }], quality_criteria: [] },
        ai_review: null,
        scores: { official: { final: 8, oga: null, tda: null }, ai: null, items: { OGA: [], TDA: [item] }, reviewer_count: 1 },
        rubric_locked: true,
        rules: { rules: [], violations: [] },
        verdict: { code: "pass", label: "Đạt", tone: "success", reasons: [], is_official: true },
        transcript: [],
        can_regenerate: false,
      })
    )
  );
  await page.goto("/report/5");

  await expect(page.getByTestId("plan-lock")).toContainText("Đánh giá theo rubric chi tiết");
  await expectGoesToPricing(page);
});
