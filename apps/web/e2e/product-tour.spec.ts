import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test Suite: Product Tour (GraduAI / DefendAI)
 *
 * Bao gồm 5 kịch bản:
 * 1. Signup user mới → tour tự hiện trên /documents → Next/Back hoạt động ở
 *    mọi bước → Hoàn thành → reload không hiện lại.
 * 2. Signup → ESC = skip → reload + đăng xuất/đăng nhập lại → không hiện
 *    (cờ done sống sót qua clearSession).
 * 3. Đăng nhập user ĐÃ xem tour (done có sẵn) → không hiện tour.
 * 4. Đăng nhập user CŨ (không có bất kỳ flag nào) → không hiện tour.
 * 5. Signup → tour đang mở → rời /documents bằng browser Back (client-side
 *    nav, root layout không remount) → overlay phải tự đóng ngay trên route
 *    mới; goForward quay lại /documents → tour mở lại từ đầu (pending còn).
 */

const NEW_USER_ID = 999;
const PENDING_KEY = `defendai_tour_pending_${NEW_USER_ID}`;
const DONE_KEY = `defendai_tour_done_${NEW_USER_ID}`;

const STEP_TITLES = [
  "Chào mừng đến với GraduAI! 🎉",
  "Tải lên tài liệu của bạn",
  "Sắp xếp gọn với Workspace",
  "Thêm tài liệu vào workspace",
  "Luyện phản biện tại Mock Room",
  "Theo dõi tiến độ của bạn",
  "Luôn có người giúp bạn 🚀",
];

const mockStudentUser = {
  id: NEW_USER_ID,
  email: "new.student@defendai.dev",
  full_name: "New Student",
  is_active: true,
  roles: ["student"],
  profile_data: {},
  major: "Khác", // /me trả major → trang onboarding tự chuyển tiếp sang /documents
};

/**
 * Helper: Tạo JWT giả lập có expiry hợp lệ để AuthGate không bị timeout/hết hạn phiên
 */
function createMockJwt(userId: number, role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: String(userId),
      role,
      exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 ngày
    })
  ).toString("base64url");
  return `${header}.${payload}.mock-signature`;
}

async function setupApiMocks(page: Page) {
  // Đăng ký thành công luôn (mock) — trả user student id 999
  await page.route("**/api/auth/register", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        token: createMockJwt(NEW_USER_ID, "student"),
        refresh_token: "mock-refresh-token",
        user: mockStudentUser,
      }),
    });
  });

  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        token: createMockJwt(NEW_USER_ID, "student"),
        refresh_token: "mock-refresh-token",
        user: mockStudentUser,
      }),
    });
  });

  // Mock /api/auth/me để useAuth đồng bộ vai trò người dùng đúng
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStudentUser),
    });
  });

  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: createMockJwt(NEW_USER_ID, "student"),
        refresh_token: "mock-new-refresh-token",
      }),
    });
  });

  // Mock tài liệu + workspace cho trang /documents
  await page.route("**/api/documents**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 0, items: [] }),
    });
  });

  await page.route("**/api/workspaces**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 0, items: [] }),
    });
  });

  // Giảm nhiễu mạng cho các floating component
  await page.route("**/api/bookings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route("**/api/feedback/user-context", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user_id: NEW_USER_ID,
        email: mockStudentUser.email,
        full_name: mockStudentUser.full_name,
        current_plan: "free",
        has_submitted: false,
        eligible_for_feedback: false,
        detected_features: [],
        feature_counts: {},
        mock_ai_trial_tickets: 0,
      }),
    });
  });
}

/**
 * Helper: Đăng nhập người dùng qua form UI đăng nhập
 */
async function loginUser(page: Page, email: string, pass: string = "DefendAI@123") {
  await page.goto("/login");
  const loginForm = page.locator("form", {
    has: page.locator('button[type="submit"]:has-text("Đăng nhập")'),
  });
  await loginForm.locator("#email").fill(email);
  await loginForm.locator("#password").fill(pass);
  await loginForm.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
}

/**
 * Helper: Đăng ký tài khoản mới qua form UI đăng ký → chuyển tới /documents
 */
async function signupStudent(page: Page) {
  await page.goto("/register");
  const registerForm = page.locator("form", {
    has: page.locator('button[type="submit"]:has-text("Tạo tài khoản")'),
  });
  await registerForm.locator("#name").fill("New Student");
  await registerForm.locator("#email").fill(mockStudentUser.email);
  await registerForm.locator("#password").fill("Abcdef1!");
  await registerForm.locator('button[type="submit"]').click();
  // Đăng ký xong → /onboarding (chọn ngành); /me mock có sẵn major → tự
  // chuyển tiếp sang /documents và tour mở ở đó.
  await page.waitForURL((url) => url.pathname.includes("/onboarding"), { timeout: 10000 });
  await page.waitForURL((url) => url.pathname.includes("/documents"), { timeout: 10000 });
}

/**
 * Helper: chờ đủ lâu (delay ~800ms + poll ~3s của gate) rồi xác nhận tour
 * KHÔNG xuất hiện — dùng cho các assertion "không dính tour".
 */
async function expectTourNotShown(page: Page) {
  // 4200ms > cửa sổ mở tour tối đa ~3800ms (delay 800ms + poll 20×150ms).
  await page.waitForTimeout(4200);
  await expect(page.locator('[data-testid="product-tour-card"]')).not.toBeVisible();
}

test.describe("Product Tour cho user mới signup", () => {
  test("Kịch bản 1: Signup → tour tự hiện → Next/Back ở mọi bước → Hoàn thành → reload không hiện lại", async ({
    page,
  }) => {
    await setupApiMocks(page);
    await signupStudent(page);

    const tourCard = page.locator('[data-testid="product-tour-card"]');

    // 1. Tour tự hiện sau delay gate (~800ms) với bước chào mừng ở giữa màn hình
    await expect(tourCard).toBeVisible();
    await expect(tourCard).toContainText("Bước 1/7");
    await expect(tourCard).toContainText(STEP_TITLES[0]);
    // Bước 1 không có target → KHÔNG có spotlight
    await expect(page.locator('[data-testid="product-tour-spotlight"]')).toHaveCount(0);

    // 2. Next → bước 2 spotlight đúng nút upload
    await page.locator('[data-testid="tour-next"]').click();
    await expect(tourCard).toContainText("Bước 2/7");
    await expect(tourCard).toContainText(STEP_TITLES[1]);
    await expect(page.locator('[data-testid="product-tour-spotlight"]')).toBeVisible();

    // 3. Back → quay về bước 1
    await page.locator('[data-testid="tour-back"]').click();
    await expect(tourCard).toContainText("Bước 1/7");
    await expect(tourCard).toContainText(STEP_TITLES[0]);

    // 4. Next lần lượt tới bước cuối; qua bước 3 → 4 tour tự điều hướng sang /workspaces
    for (let i = 1; i < STEP_TITLES.length; i++) {
      await page.locator('[data-testid="tour-next"]').click();
      await expect(tourCard).toContainText(`Bước ${i + 1}/7`);
      await expect(tourCard).toContainText(STEP_TITLES[i]);
      if (i === 3) {
        await expect(page).toHaveURL(/\/workspaces/);
        await expect(tourCard).toContainText(STEP_TITLES[3]); // bước ví dụ "Thêm tài liệu vào workspace"
      }
    }

    // 5. Bước cuối: nút đổi thành "Hoàn thành" → bấm xong tour đóng
    await expect(page.locator('[data-testid="tour-next"]')).toHaveText("Hoàn thành");
    await page.locator('[data-testid="tour-next"]').click();
    await expect(tourCard).not.toBeVisible();

    // 6. Trạng thái localStorage: done = completed, pending đã xoá
    const done = await page.evaluate((key) => localStorage.getItem(key), DONE_KEY);
    expect(done).toBe("completed");
    const pending = await page.evaluate((key) => localStorage.getItem(key), PENDING_KEY);
    expect(pending).toBeNull();

    // 7. Reload → tour không hiện lại
    await page.reload();
    await expectTourNotShown(page);
  });

  test("Kịch bản 2: Signup → ESC = skip → reload + đăng xuất/đăng nhập lại → không hiện", async ({
    page,
  }) => {
    await setupApiMocks(page);
    await signupStudent(page);

    const tourCard = page.locator('[data-testid="product-tour-card"]');
    await expect(tourCard).toBeVisible();
    await expect(tourCard).toContainText("Bước 1/7");

    // 1. ESC = skip
    await page.keyboard.press("Escape");
    await expect(tourCard).not.toBeVisible();

    // 2. Trạng thái localStorage: done = skipped, pending đã xoá
    const done = await page.evaluate((key) => localStorage.getItem(key), DONE_KEY);
    expect(done).toBe("skipped");
    const pending = await page.evaluate((key) => localStorage.getItem(key), PENDING_KEY);
    expect(pending).toBeNull();

    // 3. Reload → không hiện lại
    await page.reload();
    await expectTourNotShown(page);

    // 4. Đăng xuất (mô phỏng clearSession: chỉ xoá token/user, giữ flag tour)
    //    rồi đăng nhập lại → tour KHÔNG hiện (done sống sót qua clearSession)
    await page.evaluate(() => {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
    });
    const doneAfterLogout = await page.evaluate(
      (key) => localStorage.getItem(key),
      DONE_KEY
    );
    expect(doneAfterLogout).toBe("skipped");

    await loginUser(page, mockStudentUser.email);
    await expectTourNotShown(page);
  });

  test("Kịch bản 3: Đăng nhập user ĐÃ xem tour (done có sẵn) → không hiện tour", async ({
    page,
  }) => {
    await setupApiMocks(page);

    // User đã xem tour trước đó trên máy này
    await page.addInitScript((key) => {
      localStorage.setItem(key, "completed");
    }, DONE_KEY);

    await loginUser(page, mockStudentUser.email);
    await expectTourNotShown(page);
  });

  test("Kịch bản 4: Đăng nhập user CŨ (không có bất kỳ flag tour nào) → không hiện tour", async ({
    page,
  }) => {
    await setupApiMocks(page);

    // User cũ đi lại app: chưa từng signup trên máy này → không có pending,
    // cũng không có done → gate không bao giờ mở tour
    await loginUser(page, mockStudentUser.email);
    await expectTourNotShown(page);
  });

  test("Kịch bản 5: Tour đang mở → browser Back rời /documents → overlay tự đóng; quay lại → mở lại từ đầu", async ({
    page,
  }) => {
    await setupApiMocks(page);
    await signupStudent(page);

    const tourCard = page.locator('[data-testid="product-tour-card"]');

    // 1. Tour đang mở trên /documents
    await expect(tourCard).toBeVisible();
    await expect(tourCard).toContainText("Bước 1/7");

    // 2. Client-side Back (popstate — root layout KHÔNG remount, đúng đường
    //    mà bug từng lọt: gate chỉ return sớm, không setShowTour(false)) về
    //    /register → overlay + card phải biến mất NGAY trên route mới.
    await page.goBack();
    await expect(page).toHaveURL(/\/register/);
    await expect(tourCard).not.toBeVisible();

    // 3. Quay lại /documents (forward) → pending chưa xoá → tour mở lại từ đầu
    await page.goForward();
    await expect(page).toHaveURL(/\/documents/);
    await expect(tourCard).toBeVisible();
    await expect(tourCard).toContainText("Bước 1/7");

    // 4. Dọn dẹp: ESC = skip để kết thúc phiên sạch sẽ
    await page.keyboard.press("Escape");
    await expect(tourCard).not.toBeVisible();
    const done = await page.evaluate((key) => localStorage.getItem(key), DONE_KEY);
    expect(done).toBe("skipped");
  });

  test("Kịch bản 6: Bấm Trợ giúp trên topbar → tour mở lại từ bước 1 (kể cả đã xem)", async ({
    page,
  }) => {
    await setupApiMocks(page);
    await signupStudent(page);

    const tourCard = page.locator('[data-testid="product-tour-card"]');
    await expect(tourCard).toBeVisible();

    // Đóng tour (skip → có cờ done) rồi bấm Trợ giúp: replay phải bỏ qua cờ done
    await page.keyboard.press("Escape");
    await expect(tourCard).not.toBeVisible();

    await page.locator('[data-testid="topbar-help"]').click();
    await expect(tourCard).toBeVisible();
    await expect(tourCard).toContainText("Bước 1/7");
    await expect(tourCard).toContainText(STEP_TITLES[0]);
  });
});
