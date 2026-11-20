"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  isTourDone,
  isTourPending,
  markTourDone,
  TOUR_REPLAY_EVENT,
  TOUR_STEPS,
} from "@/lib/tour";
import { ProductTour } from "./ProductTour";

/**
 * Gate mount DUY NHẤT toàn app (layout.tsx, cạnh FeedbackFloatingButton —
 * đúng pattern floating component global). Chỉ mở tour khi ĐỦ điều kiện:
 * 1. Đang ở /documents — route duy nhất render đủ anchor cho cả 6 bước.
 * 2. user?.id đã có giá trị từ useAuth (uid null → không mở; an toàn hydration
 *    vì mọi check localStorage nằm trong useEffect, theo rule useAuth.ts:25-31).
 * 3. Role student (register chỉ tạo student — auth.py gán role mặc định).
 * 4. Có cờ pending (đặt lúc signup) && chưa có cờ done.
 *
 * Sau khi điều kiện đạt: đợi ~800ms cho trang render xong, rồi poll chờ
 * selector target đầu tiên (tối đa ~3s) mới show — nếu target không kịp xuất
 * hiện vẫn show, ProductTour tự fallback card giữa màn hình từng bước.
 *
 * Rời /documents giữa chừng tour đang mở → đóng tour ngay (xung đột route);
 * pending chưa xoá nên quay lại /documents sẽ mở lại từ đầu.
 *
 * Chống mở lại sau khi đã xem: KHÔNG dùng ref "đã mở" (React StrictMode chạy
 * effect 2 lần — cleanup của lần 1 sẽ hủy lịch hẹn và lần 2 bị ref chặn →
 * tour không bao giờ mở). Thay vào đó, mọi lần effect chạy lại (và cả mỗi
 * lần tryOpen bắn) đều re-check pending/done: sau khi tour đóng, pending đã
 * bị xoá + done đã ghi nên không bao giờ mở lại.
 */

/** Route MỞ tour (bước 1). Các bước sau do ProductTour tự điều hướng sang /workspaces. */
const TOUR_ROUTE = "/documents";
/** Mọi route tour sử dụng — tour chỉ sống trên các route này, rời khỏi là đóng. */
const TOUR_ROUTES = Array.from(new Set(TOUR_STEPS.map((s) => s.route)));
const OPEN_DELAY_MS = 800;
const TARGET_POLL_INTERVAL_MS = 150;
const TARGET_POLL_MAX_TRIES = 20; // ~3s

export function ProductTourGate() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [showTour, setShowTour] = useState(false);

  const uid = user?.id;
  const roles = user?.roles ?? [];
  const isStudent =
    roles.includes("student") && !roles.includes("admin") && !roles.includes("mentor");

  useEffect(() => {
    // Rời khỏi các route của tour giữa chừng (browser/hardware Back, hoặc
    // Tab+Enter — overlay của ProductTour chỉ chặn pointer events, không có
    // focus trap) → phải đóng tour NGAY. Gate mount ở root layout nên root
    // React KHÔNG remount khi client-side navigate: nếu không chủ động
    // setShowTour(false) thì overlay z-[10000] + card sẽ treo trên route khác
    // cho tới khi user bấm Hoàn thành/Bỏ qua/ESC.
    // Riêng route sau của tour (/workspaces) là điều hướng CHÍNH THỨC do
    // ProductTour thực hiện khi đổi bước → giữ tour mở, không đóng.
    // KHÔNG ghi cờ done ở đây: pending còn nguyên nên quay lại route bắt đầu
    // sẽ mở lại tour từ đầu — khớp hành vi "F5 giữa tour → mở lại" đã chấp
    // nhận trong thiết kế ("phiên đầu tiên sau signup").
    if (!TOUR_ROUTES.includes(pathname)) {
      setShowTour(false);
      return;
    }
    // Chỉ MỞ tour tại route bắt đầu (/documents); trên /workspaces tour đã mở
    // rồi — không mở mới, không đóng.
    if (pathname !== TOUR_ROUTE) return;
    if (!isStudent) return;
    if (uid == null) return;
    if (!isTourPending(uid) || isTourDone(uid)) return;

    let cancelled = false;
    const timers: number[] = [];
    // Selector có target đầu tiên (bước 2 — nút upload luôn render ở header
    // /documents kể cả khi danh sách docs đang loading/rỗng).
    const firstTargetSelector = TOUR_STEPS.map((s) => s.target).find(Boolean) ?? "";

    const tryOpen = (tries: number) => {
      if (cancelled) return;
      // Re-check: trạng thái có thể đã đổi giữa chừng (đã xem/xoá pending).
      if (!isTourPending(uid) || isTourDone(uid)) return;
      const ready =
        !firstTargetSelector || document.querySelector(firstTargetSelector) !== null;
      if (ready || tries >= TARGET_POLL_MAX_TRIES) {
        setShowTour(true);
        return;
      }
      timers.push(window.setTimeout(() => tryOpen(tries + 1), TARGET_POLL_INTERVAL_MS));
    };

    timers.push(window.setTimeout(() => tryOpen(0), OPEN_DELAY_MS));
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, uid, isStudent]);

  // Nút "Trợ giúp" trên topbar (AppShell) phát TOUR_REPLAY_EVENT để XEM LẠI
  // tour từ bước 1 — hành động chủ động của user nên BỎ QUA điều kiện
  // pending/done của gate (user đã xem vẫn được xem lại). ProductTour mount
  // mới luôn bắt đầu từ index 0.
  useEffect(() => {
    const replay = () => {
      if (!isStudent || uid == null) return;
      setShowTour(true);
    };
    window.addEventListener(TOUR_REPLAY_EVENT, replay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, replay);
  }, [isStudent, uid]);

  const handleDone = (status: "completed" | "skipped") => {
    if (uid != null) markTourDone(uid, status);
    setShowTour(false);
  };

  if (!showTour) return null;
  return <ProductTour steps={TOUR_STEPS} onDone={handleDone} />;
}
