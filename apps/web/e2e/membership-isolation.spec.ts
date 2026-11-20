import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test Suite: Gói thành viên gắn với TÀI KHOẢN, không phải trình duyệt.
 *
 * Bug gốc: cờ localStorage `membership_plan` không bị xoá khi đăng xuất và
 * AuthProvider chỉ ghi đè khi user CÓ gói, nên tài khoản mới tạo trên cùng trình
 * duyệt thừa hưởng VIP của người dùng trước.
 *
 * AuthProvider chỉ gọi /me khi tải trang, nên có 2 đường phải kiểm tra riêng:
 * có reload (page.goto) và chuyển trang ngay sau khi đăng nhập / đăng ký (không reload).
 *
 * Bao gồm 7 kịch bản:
 * 1. User VIP đăng xuất → đăng ký tài khoản mới cùng trình duyệt → gói Free.
 * 2. Trình duyệt còn sót cờ VIP từ trước → user không có gói vào thẳng → gói Free,
 *    cờ bị dọn.
 * 3. User VIP thật đăng xuất rồi đăng nhập lại → vẫn VIP (không dọn nhầm).
 * 4. Gói Free cũ trong profile (membership.plan = "free") → không hiện gói trả phí.
 * 5. Còn sót cờ VIP + vé Mock AI → đăng ký, chuyển trang không reload → gói Free.
 * 6. Còn sót cờ VIP → đăng nhập user không có gói, chuyển trang không reload → gói Free.
 * 7. User VIP thật đăng nhập, chuyển trang không reload → thấy đúng VIP.
 */

const FREE_USER_ID = 999;
const VIP_USER_ID = 42;

const mockFreeUser = {
  id: FREE_USER_ID,
  email: "new.student@defendai.dev",
  full_name: "New Student",
  is_active: true,
  roles: ["student"],
  profile_data: {},
  major: "Khác", // /me trả major → trang onboarding tự chuyển tiếp sang /documents
};

const mockVipUser = {
  id: VIP_USER_ID,
  email: "vip.student@defendai.dev",
  full_name: "Vip Student",
  is_active: true,
  roles: ["student"],
  profile_data: {
    membership: {
      plan: "vip",
      cycle: "monthly",
      status: "active",
      activated_at: "2026-11-01T00:00:00",
      expires_at: "2099-12-01T00:00:00",
    },
  },
  major: "Khác",
};

const vipSubscription = {
  plan_id: "100003",
  plan_name: "VIP",
  starts_at: "2026-11-01T00:00:00",
  expires_at: "2099-12-01T00:00:00",
  features: [{ label: "Tất cả tính năng Premium", included: true }],
};

/**
 * Helper: Tạo JWT giả lập có expiry hợp lệ để AuthGate không bị timeout/hết hạn phiên
 */
function createMockJwt(userId: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: String(userId),
      role: "student",
      exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 ngày
    })
  ).toString("base64url");
  return `${header}.${payload}.mock-signature`;
}

/** `users` tra theo sub trong token để mock phân biệt được từng tài khoản. */
async function setupApiMocks(page: Page, users: Record<number, typeof mockFreeUser | typeof mockVipUser>) {
  const userFromRequest = (authorization: string | undefined) => {
    const payload = (authorization ?? "").split(".")[1] ?? "";
    const sub = JSON.parse(Buffer.from(payload, "base64url").toString() || "{}").sub;
    return users[Number(sub)];
  };
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

  await page.route("**/api/auth/register", (route) =>
    route.fulfill(
      json({
        success: true,
        token: createMockJwt(FREE_USER_ID),
        refresh_token: "mock-refresh-token",
        user: users[FREE_USER_ID],
      })
    )
  );
  await page.route("**/api/auth/login", (route) => {
    const { email } = route.request().postDataJSON() as { email: string };
    const user = Object.values(users).find((item) => item.email === email)!;
    return route.fulfill(
      json({
        success: true,
        token: createMockJwt(user.id),
        refresh_token: "mock-refresh-token",
        user,
      })
    );
  });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill(json(userFromRequest(route.request().headers().authorization)))
  );
  await page.route("**/api/payment/account", (route) => {
    const user = userFromRequest(route.request().headers().authorization);
    return route.fulfill(
      json({
        wallet: { balance: 0, currency: "VND" },
        subscription: user?.id === VIP_USER_ID ? vipSubscription : null,
      })
    );
  });
  await page.route("**/api/feedback/user-context", (route) =>
    route.fulfill(
      json({
        user_id: FREE_USER_ID,
        current_plan: "free",
        has_submitted: false,
        eligible_for_feedback: false,
        detected_features: [],
        feature_counts: {},
        mock_ai_trial_tickets: 0,
      })
    )
  );
  // Giảm nhiễu mạng cho các trang hồ sơ / tài liệu
  await page.route("**/api/documents**", (route) => route.fulfill(json({ total: 0, items: [] })));
  await page.route("**/api/workspaces**", (route) => route.fulfill(json({ total: 0, items: [] })));
  await page.route("**/api/bookings**", (route) => route.fulfill(json([])));
  await page.route("**/api/mock-qa/**", (route) => route.fulfill(json({ items: [] })));
  await page.route("**/api/payment/create-order", (route) => route.fulfill(json({ success: true, orderCode: 1, amount: 199000, status: "PENDING" })));
}

/** Giả lập trình duyệt còn sót dữ liệu của người dùng trước (chỉ gieo một lần mỗi phiên test). */
async function seedLeftoverFlags(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("flag_seeded")) {
      sessionStorage.setItem("flag_seeded", "1");
      localStorage.setItem("membership_plan", "vip");
      localStorage.setItem("mock_ai_trial_tickets", "3");
    }
  });
}

/**
 * Mở trang rồi đánh dấu document: dấu còn nguyên sau khi chuyển trang nghĩa là không có reload.
 * Biên dịch trước các route sắp đi qua, vì next dev biên dịch lần đầu có thể tự reload trang.
 */
async function gotoAndMark(page: Page, path: string) {
  for (const route of ["/onboarding", "/documents", "/profile"]) {
    await page.request.get(route);
  }
  await page.goto(path);
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
}

async function expectNoReload(page: Page) {
  const marked = await page.evaluate(
    () => (window as unknown as { __sameDocument?: boolean }).__sameDocument
  );
  expect(marked).toBe(true);
}

/** Vào /profile bằng menu tài khoản (chuyển trang phía client, không reload). */
async function openProfileWithoutReload(page: Page) {
  await page.locator('button[aria-label="Mở menu tài khoản"]').click();
  await page.getByRole("link", { name: "Hồ sơ cá nhân" }).click();
  await page.waitForURL((url) => url.pathname === "/profile", { timeout: 15000 });
  await expectNoReload(page);
}

async function submitLoginForm(page: Page, email: string) {
  const loginForm = page.locator("form", {
    has: page.locator('button[type="submit"]:has-text("Đăng nhập")'),
  });
  await loginForm.locator("#email").fill(email);
  await loginForm.locator("#password").fill("DefendAI@123");
  await loginForm.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname.includes("/documents"), { timeout: 15000 });
}

async function loginUser(page: Page, email: string) {
  await page.goto("/login");
  await submitLoginForm(page, email);
}

async function signupStudent(page: Page) {
  await page.goto("/register");
  await submitSignupForm(page);
}

async function submitSignupForm(page: Page) {
  const registerForm = page.locator("form", {
    has: page.locator('button[type="submit"]:has-text("Tạo tài khoản")'),
  });
  await registerForm.locator("#name").fill("New Student");
  await registerForm.locator("#email").fill(mockFreeUser.email);
  await registerForm.locator("#password").fill("Abcdef1!");
  await registerForm.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname.includes("/documents"), { timeout: 15000 });
}

async function logout(page: Page) {
  // Đăng xuất từ /documents vì trên /profile menu tài khoản bị card hồ sơ che mất.
  await page.goto("/documents");
  await page.locator('button[aria-label="Mở menu tài khoản"]').click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.waitForURL((url) => url.pathname.includes("/login"), { timeout: 15000 });
}

async function expectFreeEverywhere(page: Page) {
  await page.goto("/profile");
  await expect(page.getByText("Thành viên Free")).toBeVisible();
  await expect(page.getByText("Hội viên VIP")).toHaveCount(0);

  await page.goto("/profile/billing");
  await expect(page.getByRole("heading", { level: 2, name: "Free" })).toBeVisible();
  await expect(page.getByText("Bạn đang dùng gói miễn phí")).toBeVisible();
  await expect(page.getByText("Gói cao cấp nhất")).toHaveCount(0);
  // Quyền lợi phải là của gói Free, không phải danh sách của gói trả phí
  await expect(page.getByText("Upload tối đa 3 đồ án / tháng")).toBeVisible();
  await expect(page.getByText("Upload không giới hạn đồ án")).toHaveCount(0);

  // Không có quyền Mock AI: thẻ bị khoá, chỉ có nút mua gói dẫn sang bảng giá
  await page.goto("/mock-room");
  await expect(page.getByTestId("mock-ai-locked")).toBeVisible();
  await expect(page.getByTestId("upgrade-link").first()).toHaveText("Mua gói");
  await page.getByTestId("upgrade-link").first().click();
  await page.waitForURL((url) => url.pathname === "/pricing", { timeout: 15000 });

  expect(await page.evaluate(() => localStorage.getItem("membership_plan"))).toBeNull();
}

async function expectVipEverywhere(page: Page) {
  await page.goto("/profile");
  await expect(page.getByText("Hội viên VIP")).toBeVisible();

  await page.goto("/profile/billing");
  await expect(page.getByRole("heading", { level: 2, name: "VIP" })).toBeVisible();
  await expect(page.getByText("Gói cao cấp nhất")).toBeVisible();

  await page.goto("/mock-room");
  await page.getByRole("heading", { name: "Phòng Mock AI" }).click();
  await page.waitForURL((url) => url.pathname.includes("/mock-room-ai"), { timeout: 15000 });

  expect(await page.evaluate(() => localStorage.getItem("membership_plan"))).toBe("vip");
}

test.describe("Gói thành viên không rò rỉ giữa các tài khoản", () => {
  test("Kịch bản 1: User VIP đăng xuất → đăng ký tài khoản mới cùng trình duyệt → gói Free", async ({
    page,
  }) => {
    await setupApiMocks(page, { [FREE_USER_ID]: mockFreeUser, [VIP_USER_ID]: mockVipUser });

    await loginUser(page, mockVipUser.email);
    await page.goto("/profile");
    await expect(page.getByText("Hội viên VIP")).toBeVisible();

    await logout(page);
    expect(await page.evaluate(() => localStorage.getItem("membership_plan"))).toBeNull();

    await signupStudent(page);
    await expectFreeEverywhere(page);
  });

  test("Kịch bản 2: Trình duyệt còn sót cờ VIP từ trước → user không có gói → Free và cờ bị dọn", async ({
    page,
  }) => {
    await setupApiMocks(page, { [FREE_USER_ID]: mockFreeUser });
    await seedLeftoverFlags(page);

    await loginUser(page, mockFreeUser.email);
    await expectFreeEverywhere(page);
  });

  test("Kịch bản 3: User VIP thật đăng xuất rồi đăng nhập lại → vẫn VIP", async ({ page }) => {
    await setupApiMocks(page, { [VIP_USER_ID]: mockVipUser });

    await loginUser(page, mockVipUser.email);
    await expectVipEverywhere(page);

    await logout(page);

    await loginUser(page, mockVipUser.email);
    await expectVipEverywhere(page);
  });

  test('Kịch bản 4: Profile có membership.plan = "free" → không hiện gói trả phí', async ({
    page,
  }) => {
    const freeMembershipUser = {
      ...mockFreeUser,
      profile_data: { membership: { plan: "free", cycle: "monthly", status: "active" } },
    };
    await setupApiMocks(page, { [FREE_USER_ID]: freeMembershipUser });

    await loginUser(page, freeMembershipUser.email);

    await page.goto("/profile");
    await expect(page.getByText("Thành viên Free")).toBeVisible();

    await page.goto("/profile/billing");
    await expect(page.getByRole("heading", { level: 2, name: "Free" })).toBeVisible();
    await expect(page.getByText("Upload tối đa 3 đồ án / tháng")).toBeVisible();
  });

  test("Kịch bản 5: Còn sót cờ VIP + vé Mock AI → đăng ký, chuyển trang không reload → gói Free", async ({
    page,
  }) => {
    await setupApiMocks(page, { [FREE_USER_ID]: mockFreeUser });
    await seedLeftoverFlags(page);
    // Tour của user mới sẽ che menu tài khoản.
    await page.addInitScript(
      (userId) => localStorage.setItem(`defendai_tour_done_${userId}`, "completed"),
      FREE_USER_ID
    );

    await gotoAndMark(page, "/register");
    await submitSignupForm(page);
    await expectNoReload(page);

    expect(await page.evaluate(() => localStorage.getItem("membership_plan"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("mock_ai_trial_tickets"))).toBeNull();

    await openProfileWithoutReload(page);
    await expect(page.getByText("Thành viên Free")).toBeVisible();
    await expect(page.getByText("Hội viên VIP")).toHaveCount(0);
  });

  test("Kịch bản 6: Còn sót cờ VIP → đăng nhập user không có gói, chuyển trang không reload → gói Free", async ({
    page,
  }) => {
    await setupApiMocks(page, { [FREE_USER_ID]: mockFreeUser });
    await seedLeftoverFlags(page);

    await gotoAndMark(page, "/login");
    await submitLoginForm(page, mockFreeUser.email);
    await expectNoReload(page);

    expect(await page.evaluate(() => localStorage.getItem("membership_plan"))).toBeNull();

    await openProfileWithoutReload(page);
    await expect(page.getByText("Thành viên Free")).toBeVisible();
    await expect(page.getByText("Hội viên VIP")).toHaveCount(0);
  });

  test("Kịch bản 7: User VIP thật đăng nhập, chuyển trang không reload → thấy đúng VIP", async ({
    page,
  }) => {
    await setupApiMocks(page, { [VIP_USER_ID]: mockVipUser });

    await gotoAndMark(page, "/login");
    await submitLoginForm(page, mockVipUser.email);
    await expectNoReload(page);

    expect(await page.evaluate(() => localStorage.getItem("membership_plan"))).toBe("vip");

    await openProfileWithoutReload(page);
    await expect(page.getByText("Hội viên VIP")).toBeVisible();
  });
});
