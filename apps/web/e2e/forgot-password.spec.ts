import { test, expect, Page, Route } from "@playwright/test";

/**
 * E2E Test Suite: Quên mật khẩu bằng mã OTP, làm hết trên một trang (API được mock).
 * Thứ tự 3 bước: nhập email → nhập mã (server kiểm tra) → nhập mật khẩu mới.
 *
 * Bao gồm 10 kịch bản:
 * 1. Từ /login bấm "Quên mật khẩu?" → gửi email → hiện bước nhập mã, chưa có ô mật khẩu.
 * 2. Backend chưa cấu hình gửi mail (503) → hiện lỗi, vẫn ở bước nhập email.
 * 3. Mã thiếu số bị chặn ở client; mã đúng → sang bước mật khẩu, không đổi trang.
 * 4. Mã sai (400) → hiện lỗi, ở lại bước nhập mã, vẫn chưa có ô mật khẩu.
 * 5. Chặn mật khẩu yếu và nhập lại không khớp ở client → gửi đúng email + mã + mật khẩu
 *    → thành công → xoá phiên cũ → về /login.
 * 6. Mã mất hiệu lực khi đang ở bước mật khẩu (400) → quay lại bước nhập mã kèm lỗi.
 * 7. Backend từ chối mật khẩu (422) → ở lại bước mật khẩu, không bắt nhập lại mã.
 * 8. Ô mã chỉ nhận số, dán "123 456" vẫn đủ 6 số.
 * 9. Gửi lại mã: khoá nút trong thời gian chờ → sau đó gửi lại được và xoá mã đã nhập.
 * 10. Đổi email → quay lại bước nhập email.
 */

const OTP = "042137";
const EMAIL = "student@defendai.dev";
const STRONG_PASSWORD = "NewPass2@";
const SENT_MESSAGE = "Nếu email này đã đăng ký, chúng tôi đã gửi mã xác nhận (có hiệu lực 10 phút).";
const INVALID_OTP = "Mã xác nhận không đúng hoặc đã hết hạn. Nếu đã nhập sai nhiều lần, hãy gửi lại mã mới.";

const json = (status: number, body: unknown) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const SENT_REPLY = json(200, { success: true, message: SENT_MESSAGE, resend_after_seconds: 60 });
const VERIFIED_REPLY = json(200, { success: true });

// Chỉ lấy alert trong form: Next.js cũng có #__next-route-announcer__ với role="alert".
const formAlert = (page: Page) => page.locator('form [role="alert"]');

/** Ghi lại body các request tới `pattern` rồi trả về `reply`. */
async function mockPost(page: Page, pattern: string, reply: ReturnType<typeof json>) {
  const bodies: unknown[] = [];
  await page.route(pattern, (route: Route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill(reply);
  });
  return bodies;
}

/** Mở trang, gửi email và chờ tới bước nhập mã. */
async function goToOtpStep(page: Page) {
  await page.goto("/forgot-password");
  await page.locator("#email").fill(EMAIL);
  await page.getByRole("button", { name: "Gửi mã xác nhận" }).click();
  await expect(page.locator("#otp")).toBeVisible();
}

/** Đi tiếp từ bước nhập mã tới bước mật khẩu. */
async function goToPasswordStep(page: Page) {
  await goToOtpStep(page);
  await page.locator("#otp").fill(OTP);
  await page.getByRole("button", { name: "Xác nhận mã" }).click();
  await expect(page.locator("#password")).toBeVisible();
}

test.describe("Bước 1: Gửi mã xác nhận", () => {
  test("Kịch bản 1: Từ /login vào quên mật khẩu → gửi email → hiện bước nhập mã, chưa có ô mật khẩu", async ({ page }) => {
    const bodies = await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);

    await page.goto("/login");
    await page.getByRole("link", { name: "Quên mật khẩu?" }).first().click();
    await page.waitForURL((url) => url.pathname === "/forgot-password", { timeout: 15000 });

    await page.locator("#email").fill(EMAIL);
    await page.getByRole("button", { name: "Gửi mã xác nhận" }).click();

    await expect(page.getByRole("status")).toHaveText(SENT_MESSAGE);
    await expect(page.getByRole("heading", { name: "Nhập mã xác nhận" })).toBeVisible();
    await expect(page.getByText(`gửi tới ${EMAIL}`)).toBeVisible();
    await expect(page.locator("#otp")).toBeFocused();
    await expect(page.locator("#password")).toHaveCount(0);
    await expect(page.locator("#confirm-password")).toHaveCount(0);
    await expect(page).toHaveURL(/\/forgot-password$/);
    expect(bodies).toEqual([{ email: EMAIL }]);

    await page.getByRole("link", { name: "Quay lại đăng nhập" }).click();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 15000 });
  });

  test("Kịch bản 2: Chưa cấu hình gửi mail → hiện lỗi, vẫn ở bước nhập email", async ({ page }) => {
    await mockPost(
      page,
      "**/api/auth/forgot-password",
      json(503, { detail: "Hệ thống chưa cấu hình gửi email. Vui lòng liên hệ quản trị viên." })
    );

    await page.goto("/forgot-password");
    await page.locator("#email").fill(EMAIL);
    await page.getByRole("button", { name: "Gửi mã xác nhận" }).click();

    await expect(formAlert(page)).toContainText("chưa cấu hình gửi email");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#otp")).toHaveCount(0);
  });
});

test.describe("Bước 2: Kiểm tra mã", () => {
  test("Kịch bản 3: Mã thiếu số bị chặn ở client; mã đúng → sang bước mật khẩu, không đổi trang", async ({ page }) => {
    await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    const bodies = await mockPost(page, "**/api/auth/verify-reset-otp", VERIFIED_REPLY);
    await goToOtpStep(page);
    const confirmOtp = page.getByRole("button", { name: "Xác nhận mã" });

    await page.locator("#otp").fill("123");
    await confirmOtp.click();
    await expect(formAlert(page)).toContainText("đủ 6 số");
    expect(bodies).toEqual([]);
    await expect(page.locator("#password")).toHaveCount(0);

    await page.locator("#otp").fill(OTP);
    await confirmOtp.click();

    await expect(page.getByRole("heading", { name: "Tạo mật khẩu mới" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Mã xác nhận hợp lệ");
    await expect(page.locator("#password")).toBeFocused();
    await expect(page.locator("#otp")).toHaveCount(0);
    await expect(page).toHaveURL(/\/forgot-password$/);
    expect(bodies).toEqual([{ email: EMAIL, otp: OTP }]);
  });

  test("Kịch bản 4: Mã sai → hiện lỗi, ở lại bước nhập mã, vẫn chưa có ô mật khẩu", async ({ page }) => {
    await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    await mockPost(page, "**/api/auth/verify-reset-otp", json(400, { detail: INVALID_OTP }));
    const resetBodies = await mockPost(page, "**/api/auth/reset-password", json(200, { success: true }));
    await goToOtpStep(page);

    await page.locator("#otp").fill(OTP);
    await page.getByRole("button", { name: "Xác nhận mã" }).click();

    await expect(formAlert(page)).toContainText("không đúng hoặc đã hết hạn");
    await expect(page.getByRole("heading", { name: "Nhập mã xác nhận" })).toBeVisible();
    await expect(page.locator("#otp")).toHaveValue(OTP);
    await expect(page.locator("#password")).toHaveCount(0);
    expect(resetBodies).toEqual([]);
  });

  test("Kịch bản 8: Ô mã chỉ nhận số, dán mã có dấu cách vẫn đủ 6 số", async ({ page }) => {
    await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    await goToOtpStep(page);
    const otpInput = page.locator("#otp");

    await otpInput.fill("12ab34");
    await expect(otpInput).toHaveValue("1234");

    await otpInput.fill(" 123 456 ");
    await expect(otpInput).toHaveValue("123456");

    await otpInput.fill("12345678");
    await expect(otpInput).toHaveValue("123456");
  });

  test("Kịch bản 9: Gửi lại mã bị khoá trong thời gian chờ, sau đó gửi được và xoá mã đã nhập", async ({ page }) => {
    await page.clock.install();
    const bodies = await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    await goToOtpStep(page);

    const waiting = page.getByRole("button", { name: /Gửi lại mã sau \d+s/ });
    await expect(waiting).toBeDisabled();
    await expect(waiting).toHaveText(/sau 5\ds/); // Đồng hồ thật sự đếm lùi.
    await page.locator("#otp").fill(OTP);

    await page.clock.fastForward(61_000);
    const resend = page.getByRole("button", { name: "Gửi lại mã", exact: true });
    await expect(resend).toBeEnabled();
    await resend.click();

    await expect(page.locator("#otp")).toHaveValue("");
    await expect(waiting).toBeDisabled();
    expect(bodies).toEqual([{ email: EMAIL }, { email: EMAIL }]);
  });

  test("Kịch bản 10: Đổi email → quay lại bước nhập email", async ({ page }) => {
    await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    await goToOtpStep(page);

    await page.getByRole("button", { name: "Đổi email" }).click();

    await expect(page.locator("#email")).toHaveValue(EMAIL);
    await expect(page.locator("#otp")).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});

test.describe("Bước 3: Đặt mật khẩu mới", () => {
  test("Kịch bản 5: Kiểm tra mật khẩu ở client → thành công không đổi trang → xoá phiên cũ", async ({ page }) => {
    await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    await mockPost(page, "**/api/auth/verify-reset-otp", VERIFIED_REPLY);
    const bodies = await mockPost(
      page,
      "**/api/auth/reset-password",
      json(200, { success: true, message: "Đặt lại mật khẩu thành công." })
    );
    await goToPasswordStep(page);
    await page.evaluate(() => localStorage.setItem("refresh_token", "phien-cu"));
    const submit = page.getByRole("button", { name: "Đặt mật khẩu mới" });

    await page.locator("#password").fill("yeu");
    await page.locator("#confirm-password").fill("yeu");
    await submit.click();
    await expect(formAlert(page)).toContainText("Mật khẩu còn thiếu");

    await page.locator("#password").fill(STRONG_PASSWORD);
    await page.locator("#confirm-password").fill("NewPass2@khac");
    await submit.click();
    await expect(formAlert(page)).toContainText("không khớp");
    expect(bodies).toEqual([]);

    await page.locator("#confirm-password").fill(STRONG_PASSWORD);
    await submit.click();

    await expect(page.getByRole("status")).toContainText("Đặt lại mật khẩu thành công");
    await expect(page.getByRole("heading", { name: "Đã đổi mật khẩu" })).toBeVisible();
    await expect(page).toHaveURL(/\/forgot-password$/);
    expect(bodies).toEqual([{ email: EMAIL, otp: OTP, new_password: STRONG_PASSWORD }]);
    expect(await page.evaluate(() => localStorage.getItem("refresh_token"))).toBeNull();

    await page.getByRole("link", { name: "Đến trang đăng nhập" }).click();
    await page.waitForURL((url) => url.pathname === "/login", { timeout: 15000 });
  });

  test("Kịch bản 6: Mã mất hiệu lực khi đang ở bước mật khẩu → quay lại bước nhập mã kèm lỗi", async ({ page }) => {
    await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    await mockPost(page, "**/api/auth/verify-reset-otp", VERIFIED_REPLY);
    await mockPost(page, "**/api/auth/reset-password", json(400, { detail: INVALID_OTP }));
    await goToPasswordStep(page);

    await page.locator("#password").fill(STRONG_PASSWORD);
    await page.locator("#confirm-password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: "Đặt mật khẩu mới" }).click();

    await expect(formAlert(page)).toContainText("không đúng hoặc đã hết hạn");
    await expect(page.getByRole("heading", { name: "Nhập mã xác nhận" })).toBeVisible();
    await expect(page.locator("#otp")).toHaveValue("");
    await expect(page.locator("#otp")).toBeFocused();
    await expect(page.locator("#password")).toHaveCount(0);
  });

  test("Kịch bản 7: Backend từ chối mật khẩu → ở lại bước mật khẩu, không bắt nhập lại mã", async ({ page }) => {
    await mockPost(page, "**/api/auth/forgot-password", SENT_REPLY);
    await mockPost(page, "**/api/auth/verify-reset-otp", VERIFIED_REPLY);
    await mockPost(
      page,
      "**/api/auth/reset-password",
      json(422, { detail: [{ msg: "Value error, Mật khẩu phải có ít nhất 8 ký tự" }] })
    );
    await goToPasswordStep(page);

    await page.locator("#password").fill(STRONG_PASSWORD);
    await page.locator("#confirm-password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: "Đặt mật khẩu mới" }).click();

    await expect(formAlert(page)).toContainText("Mật khẩu phải có");
    await expect(page.getByRole("heading", { name: "Tạo mật khẩu mới" })).toBeVisible();
    await expect(page.locator("#password")).toHaveValue(STRONG_PASSWORD);
  });
});
