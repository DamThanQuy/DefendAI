import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test Suite: Feedback Flow (GraduAI / DefendAI)
 *
 * Bao gồm 3 kịch bản:
 * 1. Kịch bản 1: Login student -> Mở modal qua Floating Button -> Test conditional input (<= 3 sao)
 *    -> Hoàn thành form -> Nhận quà 1 vé Mock AI -> Mở khóa /mock-room thành công.
 * 2. Kịch bản 2: Kiểm tra chính sách Once-Only tại trang /report (không tự động bung popup).
 * 3. Kịch bản 3: Login admin -> Vào /admin/feedbacks -> Kiểm tra KPI cards và bảng danh sách phản hồi.
 */

// Mock payloads chuẩn theo schema backend
const mockStudentUser = {
  id: 3,
  email: "student@defendai.dev",
  full_name: "Student DefendAI",
  is_active: true,
  roles: ["student"],
  profile_data: {
    mock_ai_trial_tickets: 0,
    feedback_status: { submitted: false },
  },
};

const mockAdminUser = {
  id: 1,
  email: "admin@defendai.dev",
  full_name: "Admin DefendAI",
  is_active: true,
  roles: ["admin"],
  profile_data: {},
};

const mockInitialStudentContext = {
  user_id: 3,
  email: "student@defendai.dev",
  full_name: "Student DefendAI",
  current_plan: "free",
  has_submitted: false,
  detected_features: ["workspaces", "analysis"],
  feature_counts: { workspaces: 2, analysis: 1 },
  mock_ai_trial_tickets: 0,
};

const mockSubmittedStudentContext = {
  ...mockInitialStudentContext,
  has_submitted: true,
  mock_ai_trial_tickets: 1,
};

const mockFeedbackSubmitSuccess = {
  id: 101,
  success: true,
  message: "Cảm ơn bạn đã đóng góp ý kiến!",
  mock_ai_trial_tickets: 1,
  ticket_granted: true,
};

const mockAdminStats = {
  csat: {
    average_score: 4.8,
    satisfied_count: 48,
    total_responses: 50,
    satisfied_percentage: 96.0,
    rating_distribution: { "5": 40, "4": 8, "3": 1, "2": 1, "1": 0 },
    common_low_rating_reasons: [{ reason: "Tốc độ AI", count: 2 }],
  },
  nps: {
    score: 68,
    promoters_count: 39,
    passives_count: 7,
    detractors_count: 4,
    promoters_percentage: 78,
    passives_percentage: 14,
    detractors_percentage: 8,
    total_nps_responses: 50,
    distribution: { "10": 30, "8": 9, "5": 7, "2": 4 },
  },
  willingness_to_pay: {
    paid_percentage: 82.5,
    paid_count: 41,
    free_count: 9,
    total_responses: 50,
    distribution: {
      under_50k: 10,
      "50k_99k": 20,
      "100k_199k": 15,
      "200k_plus": 6,
    },
  },
  adoption_funnel: {
    registered_users: 120,
    workspaces_users: 90,
    analysis_users: 75,
    bookings_users: 40,
    meetings_users: 30,
    reports_users: 25,
    feedback_users: 50,
    funnel_percentages: {
      workspaces: 75,
      analysis: 62.5,
      bookings: 33.3,
      meetings: 25,
      reports: 20.8,
      feedbacks: 41.7,
    },
  },
  aspect_averages: {
    ui_ux: 4.7,
    ai_quality: 4.9,
    performance: 4.6,
    rubric_alignment: 4.8,
    practical_value: 4.9,
  },
};

const mockAdminFeedbackList = {
  items: [
    {
      id: 1,
      user_id: 3,
      user_email: "student@defendai.dev",
      user_name: "Student DefendAI",
      current_plan: "free",
      overall_rating: 5,
      will_recommend: 10,
      aspect_ratings: {
        ui_ux: 5,
        ai_quality: 5,
        performance: 4,
        rubric_alignment: 5,
        practical_value: 5,
        csat_10: 9,
      },
      detected_features: ["workspaces", "analysis"],
      feature_ratings: { workspaces: 3, analysis: 5 },
      low_rating_reasons: [
        "[workspaces] Cần tối ưu tốc độ phân tích tài liệu và thêm gợi ý đề tài",
      ],
      best_thing: "Giao diện trực quan và AI phản biện bám sát tiêu chí đồ án",
      suggested_change: "⚡ Tăng tốc độ AI phản hồi",
      pay_willingness: "50k_99k",
      created_at: "2026-10-31T08:30:00Z",
    },
  ],
  total: 1,
};

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

async function setupApiMocks(page: Page, options: { studentSubmitted?: boolean } = {}) {
  let studentSubmitted = options.studentSubmitted ?? false;
  let currentRole = "student";

  await page.route("**/api/auth/login", async (route) => {
    const postData = route.request().postDataJSON() || {};
    const email = postData.email || "";

    if (email.includes("admin")) {
      currentRole = "admin";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          token: createMockJwt(1, "admin"),
          refresh_token: "mock-refresh-token",
          user: mockAdminUser,
        }),
      });
    } else {
      currentRole = "student";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          token: createMockJwt(3, "student"),
          refresh_token: "mock-refresh-token",
          user: {
            ...mockStudentUser,
            profile_data: {
              ...mockStudentUser.profile_data,
              mock_ai_trial_tickets: studentSubmitted ? 1 : 0,
              feedback_status: { submitted: studentSubmitted },
            },
          },
        }),
      });
    }
  });

  // Mock /api/auth/me để useAuth đồng bộ vai trò người dùng đúng
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        currentRole === "admin"
          ? mockAdminUser
          : {
              ...mockStudentUser,
              profile_data: {
                ...mockStudentUser.profile_data,
                mock_ai_trial_tickets: studentSubmitted ? 1 : 0,
                feedback_status: { submitted: studentSubmitted },
              },
            }
      ),
    });
  });

  // Mock refresh token
  await page.route("**/api/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: createMockJwt(currentRole === "admin" ? 1 : 3, currentRole),
        refresh_token: "mock-new-refresh-token",
      }),
    });
  });

  // Mock tài liệu trên trang /documents
  await page.route("**/api/documents**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total: 0, items: [] }),
    });
  });

  // Xử lý tất cả endpoint Feedback một cách toàn diện
  await page.route(/\/api\/feedback(\/.*|\?.*)?$/, async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/api/feedback/user-context") || url.includes("/api/feedback/context")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          studentSubmitted ? mockSubmittedStudentContext : mockInitialStudentContext
        ),
      });
    } else if (url.includes("/api/feedback/stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAdminStats),
      });
    } else if (method === "POST") {
      studentSubmitted = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(mockFeedbackSubmitSuccess),
      });
    } else {
      // GET /api/feedback hoặc /api/feedback?limit=...
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAdminFeedbackList),
      });
    }
  });

  // Mock bookings cho mock-room để tránh lỗi mạng
  await page.route("**/api/bookings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("Feedback Flow & Mock AI Reward Tests", () => {
  test("Kịch bản 1: Login student -> Floating Button -> Test conditional input (<= 3 sao) -> Submit -> Nhận quà 1 vé Mock AI -> Mở khóa /mock-room", async ({
    page,
  }) => {
    await setupApiMocks(page, { studentSubmitted: false });

    // 1. Đăng nhập tài khoản student@defendai.dev / DefendAI@123
    await loginUser(page, "student@defendai.dev", "DefendAI@123");

    // 2. Click Floating Button góc trái dưới màn hình
    const floatingButton = page.locator('button[aria-label="Khảo sát ý kiến người dùng"]');
    await expect(floatingButton).toBeVisible();
    await floatingButton.click();

    // 3. Mở modal khảo sát
    const modalTitle = page.locator('h2:has-text("Khảo sát Trải nghiệm & Nhận Quà")');
    await expect(modalTitle).toBeVisible();

    // Kiểm tra thông tin gói hiện tại của user (Gói Tài Khoản Free)
    await expect(page.locator("text=Gói Tài Khoản Free")).toBeVisible();

    // 4. Test conditional input khi chọn <= 3 sao cho tính năng đã trải nghiệm
    // Tìm card của tính năng "Quản lý Đề tài & Workspace"
    const workspaceCard = page.locator(".border.rounded-xl", {
      hasText: "Quản lý Đề tài & Workspace",
    });
    await expect(workspaceCard).toBeVisible();
    await expect(workspaceCard.locator("text=Đã trải nghiệm")).toBeVisible();

    // Ban đầu mặc định 5 sao -> Ô lý do đánh giá thấp KHÔNG được hiển thị
    const lowReasonInput = workspaceCard.locator(
      'input[placeholder="Ví dụ: Tốc độ chậm, thiếu tùy chọn, câu hỏi chưa sát..."]'
    );
    await expect(lowReasonInput).not.toBeVisible();

    // Click vào ngôi sao thứ 2 (đánh giá 2 sao <= 3 sao)
    const starButtons = workspaceCard.locator("button");
    await starButtons.nth(1).click(); // Ngôi sao thứ 2

    // Kiểm tra ô conditional input xuất hiện kèm nhãn cảnh báo
    await expect(lowReasonInput).toBeVisible();
    await expect(workspaceCard.locator("text=Lý do bạn đánh giá 2 sao cho tính năng này:")).toBeVisible();

    // Điền lý do đánh giá thấp
    await lowReasonInput.fill("Cần tối ưu tốc độ phân tích tài liệu và thêm gợi ý đề tài");

    // Thử đổi sang 5 sao -> conditional input phải biến mất
    await starButtons.nth(4).click(); // Ngôi sao thứ 5
    await expect(lowReasonInput).not.toBeVisible();

    // Đổi lại về 3 sao (vẫn <= 3 sao) -> conditional input phải xuất hiện trở lại
    await starButtons.nth(2).click(); // Ngôi sao thứ 3
    await expect(lowReasonInput).toBeVisible();
    await lowReasonInput.fill("Cần tối ưu tốc độ phân tích tài liệu và thêm gợi ý đề tài");

    // Chuyển sang Bước 2
    const nextButton = page.getByRole("button", { name: "Tiếp tục" });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    // 5. Hoàn thành form tại Bước 2
    await expect(
      page.locator("text=Bước 2: Ý kiến đóng góp & Sẵn sàng chi trả")
    ).toBeVisible();

    // Nhập lời khen (bestThing)
    const bestThingTextarea = page.locator(
      'textarea[placeholder*="Ví dụ: Giao diện trực quan, câu hỏi mock phản xạ rất thực tế"]'
    );
    await bestThingTextarea.fill(
      "Giao diện trực quan và AI phản biện bám sát tiêu chí đồ án tốt nghiệp"
    );

    // Bấm chọn Quick Tag đề xuất cải tiến
    const speedTag = page.locator('button:has-text("⚡ Tăng tốc độ AI phản hồi")');
    await speedTag.click();

    const suggestedChangeTextarea = page.locator(
      'textarea[placeholder*="Bấm chọn nhanh các tag phía trên"]'
    );
    await expect(suggestedChangeTextarea).toHaveValue(/⚡ Tăng tốc độ AI phản hồi/);

    // Chọn mức NPS: Rất sẵn lòng (10đ)
    const npsButton = page.locator('button:has-text("Rất sẵn lòng")');
    await npsButton.click();

    // Chọn mức chi trả: Gói Premium (50k - 99k)
    const payOption = page.locator(
      'label:has-text("50.000đ - 99.000đ / tháng (Gói Premium)")'
    );
    await payOption.click();

    // 6. Gửi khảo sát và nhận quà tặng 1 vé Mock AI
    const submitButton = page.locator('button:has-text("Hoàn tất & Nhận quà")');
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // Bước 3: Kiểm tra màn hình quà tặng (Gift Screen)
    await expect(page.locator("text=Hoàn thành khảo sát")).toBeVisible();
    await expect(page.locator("text=Cảm ơn bạn đã đóng góp ý kiến!")).toBeVisible();
    await expect(page.getByText("+1 Vé", { exact: true })).toBeVisible();
    await expect(page.locator("text=Vé Mock Room AI 1-on-1")).toBeVisible();
    await expect(
      page.locator(
        "text=Bạn đã được cộng thêm 01 vé trải nghiệm Mock Room AI vào tài khoản."
      )
    ).toBeVisible();

    // 7. Chuyển sang /mock-room mở khóa thành công
    const activateButton = page.locator('button:has-text("Kích hoạt & Trải nghiệm ngay")');
    await expect(activateButton).toBeVisible();
    await activateButton.click();

    // Chờ điều hướng đến /mock-room
    await page.waitForURL("**/mock-room", { timeout: 10000 });
    await expect(page).toHaveURL(/.*\/mock-room/);

    // Kiểm tra card Mock AI hiển thị thông tin mở khóa bằng vé trải nghiệm
    await expect(page.getByText("Có 1 vé trải nghiệm", { exact: true })).toBeVisible();
    await expect(
      page.locator(
        "text=Bạn đang có 1 vé trải nghiệm Mock Room AI miễn phí từ khảo sát. Nhấp để tham gia ngay!"
      )
    ).toBeVisible();

    // Nhấp vào Card Phòng Mock AI để kích hoạt trải nghiệm
    await page.getByRole("heading", { name: "Phòng Mock AI" }).click();

    // Mở khóa thành công và chuyển thẳng vào /mock-room-ai (không bị alert hay chặn bởi VIP checkout)
    await page.waitForURL("**/mock-room-ai", { timeout: 10000 });
    await expect(page).toHaveURL(/.*\/mock-room-ai/);
  });

  test("Kịch bản 2: Kiểm tra chính sách Once-Only tại trang /report (không tự động bung popup)", async ({
    page,
  }) => {
    // Đã hoàn thành khảo sát (has_submitted: true)
    await setupApiMocks(page, { studentSubmitted: true });

    // Đăng nhập student
    await loginUser(page, "student@defendai.dev", "DefendAI@123");

    // Truy cập trực tiếp vào trang /report
    await page.goto("/report");
    await page.waitForLoadState("networkidle");

    // Kiểm tra trang /report được hiển thị đầy đủ
    await expect(page.locator("h1:has-text('Báo cáo & Đánh giá')")).toBeVisible();

    // Kiểm tra chính sách Once-Only: Modal khảo sát KHÔNG ĐƯỢC tự động bung lên (non-intrusive)
    const surveyModalHeader = page.locator(
      'h2:has-text("Khảo sát Trải nghiệm & Nhận Quà")'
    );
    await expect(surveyModalHeader).not.toBeVisible();

    // Chờ thêm 1.5 giây để đảm bảo không có timeout auto-open gây phiền người dùng
    await page.waitForTimeout(1500);
    await expect(surveyModalHeader).not.toBeVisible();

    // Floating Button vẫn hiện ở góc một cách tinh tế để sinh viên có thể chủ động bấm nếu muốn
    const floatingButton = page.locator('button[aria-label="Khảo sát ý kiến người dùng"]');
    await expect(floatingButton).toBeVisible();
  });

  test("Kịch bản 3: Login admin@defendai.dev / DefendAI@123 -> Vào /admin/feedbacks -> Kiểm tra KPI cards và bảng danh sách phản hồi", async ({
    page,
  }) => {
    await setupApiMocks(page);

    // 1. Đăng nhập tài khoản admin@defendai.dev / DefendAI@123
    await loginUser(page, "admin@defendai.dev", "DefendAI@123");

    // 2. Điều hướng vào trang quản trị /admin/feedbacks
    await page.goto("/admin/feedbacks");
    await page.waitForLoadState("networkidle");

    // Kiểm tra tiêu đề trang
    await expect(
      page.locator("h1:has-text('Phản hồi & Khảo sát Người dùng')")
    ).toBeVisible();

    // 3. Kiểm tra 4 KPI Overview Cards
    // Card CSAT
    const csatCard = page.locator(".border-teal-500\\/20", { hasText: "Chỉ số CSAT" });
    await expect(csatCard).toBeVisible();
    await expect(csatCard.locator("text=/ 5.0")).toBeVisible();
    await expect(csatCard.locator("text=hài lòng")).toBeVisible();

    // Card NPS
    const npsCard = page.locator(".border-cyan-500\\/20", { hasText: "Điểm NPS (Net Promoter)" });
    await expect(npsCard).toBeVisible();
    await expect(npsCard.locator("text=Promoters")).toBeVisible();

    // Card Sẵn sàng chi trả
    const payCard = page.locator(".border-purple-500\\/20", { hasText: "Sẵn sàng chi trả" });
    await expect(payCard).toBeVisible();
    await expect(payCard.locator("text=sẵn sàng mua gói trả phí")).toBeVisible();

    // Card Tổng phản hồi
    const totalCard = page.locator(".border-amber-500\\/20", { hasText: "Tổng phản hồi" });
    await expect(totalCard).toBeVisible();
    await expect(totalCard.locator("text=tài khoản đăng ký")).toBeVisible();

    // 4. Kiểm tra Danh sách chi tiết phản hồi (Bảng Feedback)
    await expect(page.locator("text=Danh sách chi tiết phản hồi")).toBeVisible();

    // Kiểm tra thanh tìm kiếm và bộ lọc
    const searchInput = page.locator(
      'input[placeholder="Tìm email, lời khen, góp ý..."]'
    );
    await expect(searchInput).toBeVisible();

    // Kiểm tra các cột trong bảng
    const tableHeader = page.locator("table thead");
    await expect(tableHeader.locator("text=Người dùng")).toBeVisible();
    await expect(tableHeader.locator("text=Gói")).toBeVisible();
    await expect(tableHeader.locator("text=Đánh giá chung")).toBeVisible();
    await expect(tableHeader.locator("text=NPS")).toBeVisible();
    await expect(tableHeader.locator("text=Tính năng đã dùng")).toBeVisible();
    await expect(tableHeader.locator("text=Lời khen / Góp ý")).toBeVisible();
    await expect(tableHeader.locator("text=Ngày gửi")).toBeVisible();
    await expect(tableHeader.locator("text=Chi tiết")).toBeVisible();

    // Kiểm tra dữ liệu feedback của student hiển thị trong bảng
    const studentRow = page.locator("table tbody tr", {
      hasText: "student@defendai.dev",
    });
    await expect(studentRow).toBeVisible();
    await expect(studentRow.locator("text=Student DefendAI")).toBeVisible();
    await expect(studentRow.locator("text=FREE")).toBeVisible();
    await expect(studentRow.locator("text=Góp ý:")).toBeVisible();

    // 5. Kiểm tra Modal Chi Tiết Feedback khi click nút "Xem"
    const viewDetailButton = studentRow.locator('button:has-text("Xem")');
    await expect(viewDetailButton).toBeVisible();
    await viewDetailButton.click();

    // Modal chi tiết xuất hiện
    const detailModal = page.locator("div.fixed.inset-0", {
      hasText: "Chi tiết Phản hồi",
    });
    await expect(detailModal).toBeVisible();
    await expect(
      detailModal.locator("text=Từ Student DefendAI (student@defendai.dev)")
    ).toBeVisible();
    await expect(
      detailModal.locator(
        "text=[workspaces] Cần tối ưu tốc độ phân tích tài liệu và thêm gợi ý đề tài"
      )
    ).toBeVisible();

    // Đóng modal chi tiết
    const closeDetailButton = detailModal.locator('button:has-text("Đóng")');
    await closeDetailButton.click();
    await expect(detailModal).not.toBeVisible();
  });
});
