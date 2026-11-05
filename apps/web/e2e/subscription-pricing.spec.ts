import { test, expect, Page, Route } from "@playwright/test";

/**
 * E2E Test Suite: Giá các gói subscription ở bảng giá, trang thanh toán và trang quản trị (API được mock).
 *
 * Bao gồm 22 kịch bản:
 * 1. Bảng giá: giá tháng và giá năm hiển thị đúng, nhãn tiết kiệm đúng.
 * 2. Nhãn tiết kiệm tính từ giá thật, không viết cứng.
 * 3-4. Thanh toán gói năm: giá gốc 12 tháng trừ đúng ưu đãi ra đúng tổng tiền (Premium, VIP).
 * 5. Thanh toán gói tháng: không có dòng ưu đãi.
 * 6. Giá VIP lấy từ hệ thống, không viết cứng.
 * 7. Giá trong đơn do backend trả về được ưu tiên hơn bảng giá đã tải.
 * 8. Gói tự tạo được bán đúng tên và đúng giá, sau khi thanh toán hiện đúng tên gói.
 * 9. Link cũ theo tên gói vẫn chọn đúng gói.
 * 10. Gói không tồn tại: báo lỗi, không tạo đơn.
 * 11. Tạo đơn lỗi: không hiện QR, thử lại được.
 * 12. Chưa đăng nhập: chuyển sang đăng nhập, không tạo đơn.
 * 13. Backend từ chối xác nhận: không báo thành công.
 * 14-15. Trang quản trị: giá năm nhập riêng, chặn giá vô lý, sửa gói không ghi đè giá năm.
 * 16. Đã mua gói tự tạo: trang gói hiện đúng tên gói, không báo đang dùng gói miễn phí.
 * 17. Đang dùng gói tháng: tab tháng "Đang sử dụng", tab năm chuyển được sang gói năm.
 * 18. Đang dùng gói năm: tab năm "Đang sử dụng", tab tháng không mời mua xuống.
 * 19. Membership cũ không có chu kỳ, gọi gói bằng tên: vẫn nhận đúng gói đang dùng.
 * 20. Mua tiếp cùng gói: hạn sử dụng cộng thêm thời gian còn lại.
 * 21. Đổi sang gói khác: báo trước gói đang dùng sẽ kết thúc.
 * 22. Sau khi thanh toán: hiện đúng hạn do backend trả về.
 */

const STUDENT = { id: 999, email: "student@defendai.dev", full_name: "Student", is_active: true, roles: ["student"], profile_data: {}, major: "Khác" };
const ADMIN = { id: 1, email: "admin@defendai.dev", full_name: "Admin", is_active: true, roles: ["admin"], profile_data: {}, major: "Khác" };

type ApiPlan = { id: number; slug: string; name: string; tagline: string; icon: string; price: number; monthly: number; yearly: number; features: unknown[]; active: boolean; sort_order: number };

function apiPlan(id: number, slug: string, name: string, monthly: number, yearly: number): ApiPlan {
  return { id, slug, name, tagline: "", icon: "zap", price: monthly, monthly, yearly, features: [], active: true, sort_order: 0 };
}

const PLANS = [
  apiPlan(1, "100001", "Free", 0, 0),
  apiPlan(2, "100002", "Premium", 99000, 990000),
  apiPlan(3, "100003", "VIP", 199000, 1990000),
];

const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

function mockJwt(userId: number): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: String(userId), exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
}

async function login(page: Page, user: typeof STUDENT) {
  await page.addInitScript(({ token, cached }) => {
    localStorage.setItem("access_token", token);
    localStorage.setItem("refresh_token", "x");
    localStorage.setItem("user", JSON.stringify(cached));
  }, { token: mockJwt(user.id), cached: user });
}

function orderFor(plan: ApiPlan, cycle: string) {
  return {
    success: true,
    orderCode: 12345678,
    amount: cycle === "yearly" ? plan.yearly : plan.monthly,
    description: "DEFEND 12345678",
    qrCode: "",
    qrImageUrl: "https://img.vietqr.io/test.png",
    accountName: "TEST",
    accountNumber: "000",
    status: "PENDING",
    isSandbox: false,
    plan: { id: plan.slug, name: plan.name, cycle, monthly: plan.monthly, yearly: plan.yearly },
  };
}

/** Mock mọi /api và ảnh QR. `orders` ghi lại body tạo đơn; `createOrder` đổi cách trả lời nếu cần. */
async function mockApi(
  page: Page,
  options: {
    user?: typeof STUDENT;
    plans?: ApiPlan[];
    createOrder?: (route: Route, body: { plan_id: string; cycle: string }) => unknown;
    mockConfirm?: ReturnType<typeof json>;
  } = {}
) {
  const plans = options.plans ?? PLANS;
  const orders: { plan_id: string; cycle: string }[] = [];
  await page.route("**/api/**", (route) => route.fulfill(json({ items: [], total: 0 })));
  await page.route("**/api/auth/me", (route) => route.fulfill(json(options.user ?? STUDENT)));
  await page.route("**/api/subscriptions", (route) => route.fulfill(json({ plans })));
  await page.route("**/api/feedback/user-context", (route) =>
    route.fulfill(json({ current_plan: "free", has_submitted: false, eligible_for_feedback: false, detected_features: [], feature_counts: {}, mock_ai_trial_tickets: 0 }))
  );
  await page.route("**/api/payment/account", (route) => route.fulfill(json({ wallet: { balance: 0, currency: "VND" }, subscription: null })));
  await page.route("**/api/payment/order-status/**", (route) => route.fulfill(json({ success: true, status: "PENDING" })));
  await page.route("**/api/payment/create-order", (route) => {
    const body = route.request().postDataJSON();
    orders.push(body);
    if (options.createOrder) return options.createOrder(route, body);
    const key = String(body.plan_id).toLowerCase();
    const plan = plans.find((item) => item.slug === key) ?? PLANS[1];
    return route.fulfill(json(orderFor(plan, body.cycle)));
  });
  if (options.mockConfirm) {
    await page.route("**/api/payment/mock-confirm/**", (route) => route.fulfill(options.mockConfirm!));
  }
  await page.route("**/img.vietqr.io/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: "" }));
  await page.route("**/api.qrserver.com/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: "" }));
  return orders;
}

const planCard = (page: Page, name: string) =>
  page.locator("h3", { hasText: new RegExp(`^${name}$`) }).locator("xpath=ancestor::*[.//a][1]");

/** Dòng trong khung "Thông tin đơn hàng", vd "Giá gốc (12 tháng):" → "1.188.000đ". */
const summaryRow = (page: Page, label: string) =>
  page.locator("div.flex.justify-between", { hasText: label }).first();

async function expectSummary(page: Page, expected: { base: string; discount?: string; total: string }) {
  await expect(summaryRow(page, "Giá gốc")).toContainText(expected.base);
  if (expected.discount) {
    await expect(summaryRow(page, "Ưu đãi gói năm")).toHaveText(new RegExp(expected.discount.replace(/[()]/g, "\\$&")));
  } else {
    await expect(page.getByText("Ưu đãi gói năm")).toHaveCount(0);
  }
  await expect(summaryRow(page, "Tổng thanh toán")).toContainText(expected.total);
}

test.describe("Bảng giá", () => {
  test("Kịch bản 1: Giá tháng và giá năm hiển thị đúng, nhãn tiết kiệm đúng", async ({ page }) => {
    await mockApi(page);
    await page.goto("/pricing");

    const headline = (name: string) => planCard(page, name).getByTestId("plan-price");

    await expect(headline("Premium")).toHaveText("99.000đ");
    await expect(planCard(page, "Premium")).toContainText("/tháng");
    await expect(planCard(page, "Premium")).toContainText("Thanh toán 99.000đ / tháng");
    await expect(headline("VIP")).toHaveText("199.000đ");
    await expect(planCard(page, "VIP")).toContainText("Thanh toán 199.000đ / tháng");

    const toggle = page.getByRole("button", { name: /Theo năm/ });
    await expect(toggle).toContainText("-17%");
    await toggle.click();

    // Số to phải là tiền thật sự trả cho cả năm, giá quy đổi theo tháng chỉ là dòng phụ.
    await expect(headline("Premium")).toHaveText("990.000đ");
    await expect(planCard(page, "Premium")).toContainText("/năm");
    await expect(planCard(page, "Premium")).toContainText("Tương đương 82.500đ / tháng");
    await expect(planCard(page, "Premium")).toContainText("1.188.000đ");
    await expect(headline("VIP")).toHaveText("1.990.000đ");
    await expect(planCard(page, "VIP")).toContainText("/năm");
    await expect(planCard(page, "VIP")).toContainText("Tương đương 165.833đ / tháng");
    await expect(planCard(page, "VIP")).toContainText("2.388.000đ");
    await expect(planCard(page, "Free")).toContainText("Miễn phí");
  });

  test("Kịch bản 2: Nhãn tiết kiệm tính từ giá thật, không viết cứng", async ({ page }) => {
    await mockApi(page, { plans: [apiPlan(1, "100001", "Free", 0, 0), apiPlan(2, "100002", "Premium", 100000, 900000)] });
    await page.goto("/pricing");

    await expect(page.getByRole("button", { name: /Theo năm/ })).toContainText("-25%");
  });
});

test.describe("Thanh toán", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, STUDENT);
  });

  test("Kịch bản 3: Premium năm: 1.188.000đ trừ 198.000đ còn 990.000đ", async ({ page }) => {
    const orders = await mockApi(page);
    await page.goto("/checkout?plan=100002&cycle=yearly");

    await expectSummary(page, { base: "1.188.000đ", discount: "(17%):-198.000đ", total: "990.000đ" });
    await expect(page.getByText("Giá gốc (12 tháng):")).toBeVisible();
    await expect(page.getByText("Số tiền thanh toán:")).toContainText("990.000đ");
    expect(orders).toEqual([{ plan_id: "100002", cycle: "yearly", method: "payos" }]);
  });

  test("Kịch bản 4: VIP năm: 2.388.000đ trừ 398.000đ còn 1.990.000đ", async ({ page }) => {
    const orders = await mockApi(page);
    await page.goto("/checkout?plan=100003&cycle=yearly");

    await expectSummary(page, { base: "2.388.000đ", discount: "(17%):-398.000đ", total: "1.990.000đ" });
    expect(orders[0].plan_id).toBe("100003");
  });

  test("Kịch bản 5: Gói tháng không có dòng ưu đãi", async ({ page }) => {
    await mockApi(page);
    await page.goto("/checkout?plan=100003&cycle=monthly");

    await expectSummary(page, { base: "199.000đ", total: "199.000đ" });
    await expect(page.getByText("Giá gốc:", { exact: true })).toBeVisible();
  });

  test("Kịch bản 6: Giá VIP lấy từ hệ thống, không viết cứng", async ({ page }) => {
    await mockApi(page, { plans: [apiPlan(3, "100003", "VIP", 150000, 1200000)] });
    await page.goto("/checkout?plan=vip&cycle=yearly");

    await expectSummary(page, { base: "1.800.000đ", discount: "(33%):-600.000đ", total: "1.200.000đ" });
  });

  test("Kịch bản 7: Giá trong đơn do backend trả về được ưu tiên hơn bảng giá đã tải", async ({ page }) => {
    await mockApi(page, {
      createOrder: (route, body) => {
        const repriced = apiPlan(2, "100002", "Premium", 120000, 1200000);
        return route.fulfill(json(orderFor(repriced, body.cycle)));
      },
    });
    await page.goto("/checkout?plan=100002&cycle=yearly");

    await expectSummary(page, { base: "1.440.000đ", discount: "(17%):-240.000đ", total: "1.200.000đ" });
  });

  test("Kịch bản 8: Gói tự tạo bán đúng tên và đúng giá, sau khi thanh toán hiện đúng tên gói", async ({ page }) => {
    const custom = apiPlan(5, "176735", "Gói Thử", 10000, 100000);
    const orders = await mockApi(page, {
      plans: [...PLANS, custom],
      mockConfirm: json({ success: true, status: "PAID", membership: { plan: "176735" } }),
    });
    await page.goto("/checkout?plan=176735&cycle=yearly");

    await expect(page.getByRole("heading", { name: "Thanh toán đăng ký gói Gói Thử" })).toBeVisible();
    await expectSummary(page, { base: "120.000đ", discount: "(17%):-20.000đ", total: "100.000đ" });
    expect(orders[0].plan_id).toBe("176735");

    await page.getByRole("button", { name: /Sandbox Demo/ }).click();
    await page.waitForURL((url) => url.pathname === "/payment-success", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Gói Gói Thử" })).toBeVisible();
  });

  test("Kịch bản 9: Link cũ theo tên gói vẫn chọn đúng gói", async ({ page }) => {
    const orders = await mockApi(page);
    await page.goto("/checkout?plan=vip&cycle=monthly");

    await expect(page.getByRole("heading", { name: "Thanh toán đăng ký gói VIP" })).toBeVisible();
    await expectSummary(page, { base: "199.000đ", total: "199.000đ" });
    expect(orders[0].plan_id).toBe("100003");
  });

  test("Kịch bản 10: Gói không tồn tại: báo lỗi, không tạo đơn", async ({ page }) => {
    const orders = await mockApi(page);
    await page.goto("/checkout?plan=khong-co-goi-nay&cycle=yearly");

    await expect(page.getByText("Gói này không tồn tại hoặc đã ngừng bán.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Quay lại bảng giá" })).toBeVisible();
    expect(orders).toEqual([]);
  });

  test("Kịch bản 11: Tạo đơn lỗi: không hiện QR, thử lại được", async ({ page }) => {
    let attempts = 0;
    await mockApi(page, {
      createOrder: (route, body) => {
        attempts += 1;
        return attempts === 1
          ? route.fulfill(json({ detail: "Không kết nối được máy chủ thanh toán. Vui lòng thử lại sau." }, 503))
          : route.fulfill(json(orderFor(PLANS[1], body.cycle)));
      },
    });
    await page.goto("/checkout?plan=100002&cycle=yearly");

    await expect(page.getByText("Không kết nối được máy chủ thanh toán")).toBeVisible();
    await expect(page.getByAltText("Mã QR thanh toán VietQR PayOS")).toHaveCount(0);
    await expect(page.getByText("Số tiền thanh toán:")).toHaveCount(0);

    await page.getByRole("button", { name: "Thử tạo lại mã thanh toán" }).click();

    await expect(page.getByAltText("Mã QR thanh toán VietQR PayOS")).toBeVisible();
    await expect(page.getByText("Số tiền thanh toán:")).toContainText("990.000đ");
    await expect(page.getByText("Không kết nối được máy chủ thanh toán")).toHaveCount(0);
  });

  test("Kịch bản 13: Backend từ chối xác nhận: không báo thành công", async ({ page }) => {
    await mockApi(page, { mockConfirm: json({ detail: "Không tìm thấy đơn hàng" }, 404) });
    await page.goto("/checkout?plan=100002&cycle=yearly");

    await page.getByRole("button", { name: /Sandbox Demo/ }).click();

    await expect(page.getByText("Không tìm thấy đơn hàng")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout/);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/checkout/);
  });
});

/** Ghi đè gói đang dùng; gọi sau mockApi. */
async function mockCurrentPlan(page: Page, subscription: Record<string, unknown>) {
  await page.route("**/api/payment/account", (route) =>
    route.fulfill(json({ wallet: { balance: 0, currency: "VND" }, subscription: { features: [], expires_at: "2099-06-15T12:00:00", ...subscription } }))
  );
}

test("Kịch bản 16: Đã mua gói tự tạo: trang gói hiện đúng tên gói", async ({ page }) => {
  await login(page, STUDENT);
  await mockApi(page);
  await mockCurrentPlan(page, { plan_id: "176735", plan_name: "Gói Thử" });
  await page.goto("/profile/billing");

  await expect(page.getByRole("heading", { level: 2, name: "Gói Thử" })).toBeVisible();
  await expect(page.getByText("Gói Gói Thử đang hoạt động")).toBeVisible();
  await expect(page.getByText("Bạn đang dùng gói miễn phí")).toHaveCount(0);
});

test.describe("Đang có gói", () => {
  const yearlyTab = (page: Page) => page.getByRole("button", { name: /Theo năm/ });
  const monthlyTab = (page: Page) => page.getByRole("button", { name: "Theo tháng" });

  test.beforeEach(async ({ page }) => {
    await login(page, STUDENT);
  });

  test("Kịch bản 17: Đang dùng gói tháng chuyển được sang gói năm", async ({ page }) => {
    const orders = await mockApi(page);
    await mockCurrentPlan(page, { plan_id: "100003", plan_name: "VIP", cycle: "monthly" });
    await page.goto("/pricing");

    const vip = planCard(page, "VIP");
    await expect(vip.getByRole("link", { name: "Đang sử dụng" })).toHaveAttribute("href", "/profile/billing");

    await yearlyTab(page).click();
    const switchLink = vip.getByRole("link", { name: "Chuyển sang gói năm" });
    await expect(switchLink).toHaveAttribute("href", "/checkout?plan=100003&cycle=yearly");
    await expect(page.getByRole("link", { name: "Đang sử dụng" })).toHaveCount(0);

    await switchLink.click();
    await page.waitForURL((url) => url.pathname === "/checkout", { timeout: 15000 });
    await expectSummary(page, { base: "2.388.000đ", discount: "(17%):-398.000đ", total: "1.990.000đ" });
    expect(orders[0]).toMatchObject({ plan_id: "100003", cycle: "yearly" });
  });

  test("Kịch bản 18: Đang dùng gói năm: tab tháng không mời mua xuống", async ({ page }) => {
    await mockApi(page);
    await mockCurrentPlan(page, { plan_id: "100003", plan_name: "VIP", cycle: "yearly" });
    await page.goto("/pricing");

    const vip = planCard(page, "VIP");
    await expect(vip.getByRole("link", { name: "Đang dùng gói năm" })).toHaveAttribute("href", "/profile/billing");

    await yearlyTab(page).click();
    await expect(vip.getByRole("link", { name: "Đang sử dụng" })).toHaveAttribute("href", "/profile/billing");
    await expect(page.getByRole("link", { name: "Chuyển sang gói năm" })).toHaveCount(0);

    await monthlyTab(page).click();
    await expect(vip.locator('a[href^="/checkout"]')).toHaveCount(0);
  });

  test("Kịch bản 19: Membership cũ không có chu kỳ, gọi gói bằng tên", async ({ page }) => {
    await mockApi(page);
    await mockCurrentPlan(page, { plan_id: "vip", plan_name: "VIP", cycle: null });
    await page.goto("/pricing");

    const vip = planCard(page, "VIP");
    await expect(vip.getByRole("link", { name: "Đang sử dụng" })).toBeVisible();

    await yearlyTab(page).click();
    await expect(vip.getByRole("link", { name: "Đang sử dụng" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Chuyển sang gói năm" })).toHaveCount(0);
    await expect(planCard(page, "Premium").getByRole("link", { name: "Đang sử dụng" })).toHaveCount(0);
  });

  test("Kịch bản 20: Mua tiếp cùng gói: hạn sử dụng cộng thêm thời gian còn lại", async ({ page }) => {
    await mockApi(page);
    await mockCurrentPlan(page, { plan_id: "100003", plan_name: "VIP", cycle: "monthly" });
    await page.goto("/checkout?plan=100003&cycle=yearly");

    // 15/6/2099 + 365 ngày.
    await expect(summaryRow(page, "Hạn sử dụng")).toContainText("15/6/2100");
    await expect(page.getByTestId("current-plan-note")).toHaveText("Thời gian còn lại của gói đang dùng được cộng thêm vào hạn sử dụng.");
  });

  test("Kịch bản 21: Đổi sang gói khác: báo trước gói đang dùng sẽ kết thúc", async ({ page }) => {
    await mockApi(page);
    await mockCurrentPlan(page, { plan_id: "100002", plan_name: "Premium", cycle: "yearly" });
    await page.goto("/checkout?plan=100003&cycle=monthly");

    await expect(page.getByTestId("current-plan-note")).toContainText("Gói Premium đang dùng sẽ kết thúc ngay khi gói VIP được kích hoạt");
    await expect(summaryRow(page, "Hạn sử dụng")).not.toContainText("2099");
  });

  test("Kịch bản 22: Sau khi thanh toán: hiện đúng hạn do backend trả về", async ({ page }) => {
    await mockApi(page);
    await page.route("**/api/payment/order-status/**", (route) =>
      route.fulfill(json({ success: true, status: "PAID", membership: { plan: "vip", cycle: "yearly", expires_at: "2100-06-15T12:00:00" } }))
    );
    await page.goto("/payment-success?plan=vip&plan_name=VIP&cycle=yearly&order_id=12345678");

    await expect(page.getByText("Hiệu lực đến").locator("xpath=ancestor::div[2]")).toContainText("15/6/2100");
  });
});

test("Kịch bản 12: Chưa đăng nhập: chuyển sang đăng nhập, không tạo đơn", async ({ page }) => {
  const orders = await mockApi(page);
  await page.goto("/checkout?plan=100002&cycle=yearly");

  await page.waitForURL((url) => url.pathname === "/login", { timeout: 15000 });
  expect(orders).toEqual([]);
});

test.describe("Trang quản trị gói", () => {
  /** Mock CRUD gói của admin, trả về danh sách body đã gửi. */
  async function mockAdmin(page: Page, plans: ApiPlan[] = PLANS) {
    await mockApi(page, { user: ADMIN, plans });
    const saved: Record<string, unknown>[] = [];
    await page.route("**/api/admin/subscriptions", (route) => {
      if (route.request().method() === "GET") return route.fulfill(json({ plans }));
      saved.push(route.request().postDataJSON());
      return route.fulfill(json({ plan: plans[1] }));
    });
    await page.route("**/api/admin/subscriptions/*", (route) => {
      saved.push(route.request().postDataJSON());
      return route.fulfill(json({ plan: plans[1] }));
    });
    return saved;
  }

  test.beforeEach(async ({ page }) => {
    await login(page, ADMIN);
  });

  test("Kịch bản 14: Giá năm nhập riêng, có gợi ý, chặn giá vô lý", async ({ page }) => {
    const saved = await mockAdmin(page);
    await page.goto("/admin/subscriptions");

    await expect(page.getByRole("row", { name: /Premium/ })).toContainText("990.000 VND");
    await expect(page.getByRole("row", { name: /Premium/ })).toContainText("(-17%)");

    await page.getByRole("button", { name: "Random mã" }).click();
    await page.getByPlaceholder("Tên gói").fill("Gói Mới");
    const monthly = page.getByLabel("Giá tháng");
    const yearly = page.getByLabel("Giá năm");

    await monthly.fill("50000");
    await expect(yearly).toHaveValue("500,000");
    await expect(page.getByText("Giảm 17% so với trả 12 tháng")).toBeVisible();

    await yearly.fill("50000");
    await page.getByRole("button", { name: "Thêm gói" }).click();
    await expect(page.getByText("Giá năm phải lớn hơn giá tháng")).toBeVisible();
    expect(saved).toEqual([]);

    await yearly.fill("450000");
    await page.getByRole("button", { name: "Thêm gói" }).click();
    await expect(page.getByText("Đã thêm gói mới.")).toBeVisible();
    expect(saved[0]).toMatchObject({ name: "Gói Mới", price: 50000, yearly: 450000 });
  });

  test("Kịch bản 15: Sửa gói không ghi đè giá năm", async ({ page }) => {
    const saved = await mockAdmin(page);
    await page.goto("/admin/subscriptions");

    await page.getByRole("row", { name: /Premium/ }).getByRole("button", { name: "Sửa" }).click();
    await expect(page.getByLabel("Giá năm")).toHaveValue("990,000");

    await page.getByPlaceholder("Mô tả ngắn").fill("Mô tả mới");
    await page.getByLabel("Giá tháng").fill("120000");
    await expect(page.getByLabel("Giá năm")).toHaveValue("990,000");

    await page.getByRole("button", { name: "Cập nhật gói" }).click();
    await expect(page.getByText("Đã cập nhật gói.")).toBeVisible();
    expect(saved[0]).toMatchObject({ tagline: "Mô tả mới", price: 120000, yearly: 990000 });
  });
});
