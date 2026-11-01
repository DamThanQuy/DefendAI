# TÀI LIỆU ĐẶC TẢ: INTERACTIVE PRODUCT TOUR (TOUR HƯỚNG DẪN NGƯỜI DÙNG MỚI)
**Hệ thống:** DefendAI / GraduAI (Nền tảng AI hỗ trợ bảo vệ đồ án tốt nghiệp)
**Tài liệu:** `DefendAI/docs/PRODUCT_TOUR_SPEC.md`
**Phiên bản:** 1.0.0
**Ngày ban hành:** 01/11/2026
**Trạng thái:** Đã triển khai (theo mẫu `docs/FEEDBACK_FEATURE_SPEC.md`)

---

## 1. MỤC TIÊU

Sinh viên vừa tạo tài khoản thường vào thẳng `/documents` mà chưa biết app có
gì. Product Tour dẫn người dùng mới đi qua **5 khu vực chính** (Upload →
Workspace → Mock Room → Báo cáo → Trợ giúp) bằng hiệu ứng spotlight tự viết,
hoàn thành trong dưới 1 phút.

Phạm vi giới hạn có chủ đích: **chỉ user mới đăng ký qua form** (backend chỉ
tạo tài khoản student tại form này — `apps/api/app/routers/auth.py` gán role
student mặc định). `AuthResponse` không có cờ `is_new_user` nên không thể phân
biệt new/existing từ login/Google — nếu sản phẩm muốn, cần thêm cờ backend.

## 2. CƠ CHẾ TRIGGER & PERSISTENCE

Phân biệt user mới/cũ dựa trên **sự kiện signup**, không dựa trên dữ liệu
tài khoản (`/me` không trả `created_at`; `profile_data` không an toàn vì
`PUT /auth/me` replace nguyên dict — `auth.py:203`).

| Key localStorage | Ý nghĩa | Đặt lúc | Xoá lúc |
|---|---|---|---|
| `defendai_tour_pending_<userId>` | Đang chờ xem tour | Ngay sau signup thành công (`handleRegister` — AuthSlider.tsx) | Khi tour đóng (hoàn thành hoặc skip) |
| `defendai_tour_done_<userId>` | Đã xem (giá trị `completed` / `skipped`) | Khi tour đóng | Không bao giờ |

Gate chỉ mở tour khi **`pending` && `!done`** → user cũ (không bao giờ có
pending) và lần xem sau (đã done) đều không dính. `clearSession`
(`lib/auth.ts:43-47`) chỉ xoá token/user nên 2 key tour **sống sót qua đăng
xuất/đăng nhập lại**. Flag key theo userId nên 2 tài khoản dùng chung máy
không đè nhau.

Điểm gọi duy nhất của `markTourPending()`: nhánh `res.ok` của
`handleRegister` trong `apps/web/src/components/auth/AuthSlider.tsx`. Không
gọi trong `handleLogin` hay `handleGoogle`.

## 3. KỊCH BẢN TOUR (6 BƯỚC, TẤT CẢ TRÊN `/documents`)

| # | Tiêu đề | Target (data-testid) | Vị trí card |
|---|---|---|---|
| 1 | Chào mừng đến với GraduAI! 🎉 | — (card giữa màn hình) | giữa |
| 2 | Tải lên tài liệu của bạn | `documents-upload-button` | dưới target, flip lên nếu thiếu chỗ |
| 3 | Sắp xếp gọn với Workspace | `sidebar-link-/workspaces` | như trên |
| 4 | Luyện phản biện tại Mock Room | `sidebar-link-/mock-room` | như trên |
| 5 | Theo dõi tiến độ của bạn | `sidebar-link-/report` | như trên |
| 6 | Luôn có người giúp bạn 🚀 | `topbar-help` | như trên |

Tương tác: **Tiếp theo / Quay lại** (mọi bước), **Bỏ qua tour** hoặc **ESC**
= skip, **Hoàn thành** ở bước cuối. Overlay chặn toàn bộ pointer event nên
user không navigate được giữa chừng bằng chuột; F5 giữa tour sẽ mở lại
(pending chưa xoá) — hành vi chấp nhận được ("phiên đầu tiên sau signup").

Rời `/documents` giữa chừng tour đang mở (browser/hardware Back, hoặc
Tab+Enter — overlay chỉ chặn pointer events, không có focus trap): gate tự
đóng tour ngay khi pathname đổi (root layout không remount nên nếu không chủ
động đóng, overlay sẽ treo trên route khác). Không ghi cờ done trong trường
hợp này — pending còn nguyên nên quay lại `/documents` sẽ mở lại tour từ đầu.

## 4. KIẾN TRÚC FRONTEND

| File | Vai trò |
|---|---|
| `apps/web/src/lib/tour.ts` | Hằng số key localStorage, helpers `markTourPending/isTourPending/markTourDone/isTourDone`, mảng `TOUR_STEPS`. Mọi hàm localStorage chỉ gọi trong useEffect (hydration-safe). |
| `apps/web/src/components/tour/ProductTour.tsx` | Spotlight tự viết (framer-motion + Tailwind, **không thêm dependency**): portal vào `document.body` (pattern ConfirmModal), overlay `z-[10000]` (> ConfirmModal `z-[9999]`, UploadModal `z-[60]`), lỗ spotlight = div phủ rect target + `box-shadow: 0 0 0 9999px` (không cần SVG mask, không dùng backdrop-blur vì sẽ mờ target), tooltip flip trên/dưới target, re-measure khi resize/scroll, poll chờ selector ~3s rồi fallback card giữa màn hình. Animate 100% framer-motion (class `animate-fade-in` của ConfirmModal không được định nghĩa trong tailwind.config.ts). |
| `apps/web/src/components/tour/ProductTourGate.tsx` | Gate mount 1 lần trong `layout.tsx` (cạnh `FeedbackFloatingButton`): chỉ mở khi `pathname === "/documents"` && `user?.id` && role student && `pending && !done`; delay ~800ms + poll chờ target tối đa ~3s. |
| `apps/web/src/app/layout.tsx` | Mount `<ProductTourGate />` cạnh `<FeedbackFloatingButton />`. |
| `apps/web/src/components/auth/AuthSlider.tsx` | 1 dòng `markTourPending(Number(data.user.id))` trong `handleRegister`. |
| `apps/web/src/components/layout/AppShell.tsx` | Thêm `data-testid="sidebar-link-<href>"` cho Link sidebar và `data-testid="topbar-help"` cho nút Trợ giúp (anchor cho spotlight). |
| `apps/web/src/app/documents/page.tsx` | Thêm `data-testid="documents-upload-button"` vào nút "+ Tải lên tài liệu mới" (luôn render ở header → anchor ổn định). |
| `apps/web/e2e/product-tour.spec.ts` | E2E Playwright theo mẫu `e2e/feedback-flow.spec.ts`. |

## 5. HẠN CHẾ ĐÃ CHẤP NHẬN

1. **Per-device:** localStorage không đồng bộ giữa máy — user signup máy A rồi
   vào máy B sẽ không thấy tour. Muốn cover cần backend trả `is_new_user`
   trong AuthResponse hoặc merge `profile_data` an toàn (phải sửa trước bug
   replace-whole `profile_data` tại `auth.py:203` và bug trang
   `profile/edit` vô tình wipe `profile_data`).
2. **Google-signup lần đầu không thấy tour:** lý do như mục 2.
3. **Spotlight lệch target** nếu layout dịch giữa chừng: đã giảm thiểu bằng
   re-measure scroll/resize + poll; fallback card giữa thay vì crash.

## 6. KỊCH BẢN KIỂM THỬ E2E

Chạy: `npx playwright test e2e/product-tour.spec.ts` trong `apps/web`
(cần dev server ở `http://localhost:3000` hoặc đặt `E2E_BASE_URL`).

1. **Signup → tour tự hiện → Next/Back → Hoàn thành →** done = `completed`;
   reload không hiện lại.
2. **Signup → ESC = skip → reload + đăng xuất/đăng nhập lại →** không hiện;
   done = `skipped` sống sót qua `clearSession`.
3. **Đăng nhập user đã xem (done có sẵn) →** không hiện tour.
4. **Đăng nhập user cũ (không có flag nào) →** không hiện tour.
5. **Tour đang mở → browser Back rời /documents →** overlay tự đóng trên
   route mới; goForward quay lại → tour mở lại từ đầu (pending còn nguyên).
