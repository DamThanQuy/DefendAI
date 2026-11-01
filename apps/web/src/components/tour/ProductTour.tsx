"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { TOUR_STEPS, type TourStep, type TourDoneStatus } from "@/lib/tour";

/**
 * Spotlight tour tự viết (không thêm dependency — framer-motion + Tailwind có sẵn).
 * Tham chiếu pattern: portal/ESC/scroll-lock của ConfirmModal.tsx:68-160,
 * animate AnimatePresence của AuthSlider.tsx:504-560.
 *
 * Cấu trúc z-index (phải trên ConfirmModal z-[9999] và UploadModal z-[60]):
 * - z-[10000]: overlay full-screen trong suốt, chặn TOÀN BỘ pointer event
 *   (user không navigate được giữa chừng).
 * - z-[10001]: lỗ spotlight — div phủ đúng rect của target + box-shadow
 *   `0 0 0 9999px` tạo màn tối quanh target (không cần SVG mask, và KHÔNG
 *   dùng backdrop-blur vì sẽ làm mờ cả target). Bước không có target (chào
 *   mừng) hoặc mất target → phủ tối toàn màn hình, card giữa.
 * - z-[10002]: tooltip card.
 *
 * Animate: 100% bằng framer-motion — class `animate-fade-in` mà ConfirmModal
 * dùng không được định nghĩa trong tailwind.config.ts nên không mượn được.
 * Lưu ý: KHÔNG căn giữa card bằng CSS transform vì framer-motion tự quản lý
 * transform (sẽ ghi đè) — bước giữa màn hình dùng wrapper flex thay thế.
 */

const CARD_WIDTH = 360;
const CARD_HEIGHT_ESTIMATE = 240; // ước lượng đủ cho flip logic, card có chiều cao tự nhiên
const CARD_GAP = 12;
const EDGE_PAD = 8;

/** Poll chờ selector xuất hiện (trang đang fetch vẫn render skeleton). */
const POLL_INTERVAL_MS = 150;
const POLL_MAX_TRIES = 20; // ~3s

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ProductTourProps {
  steps?: TourStep[];
  onDone: (status: TourDoneStatus) => void;
}

/**
 * Tính toạ độ card cạnh target (không dùng transform — framer-motion chiếm
 * transform). Dùng `bottom` cho placement "top" để không cần biết chiều cao
 * card thực tế. Trả về null khi bước không có target (card giữa màn hình,
 * căn bằng wrapper flex).
 */
function computeCardPosition(
  rect: SpotlightRect | null,
  placement: "top" | "bottom"
): React.CSSProperties | null {
  if (!rect || typeof window === "undefined") return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(CARD_WIDTH, vw - EDGE_PAD * 2);
  const rectBottom = rect.top + rect.height;

  // Flip: ưu tiên placement cấu hình, thiếu chỗ thì chuyển phía đối diện.
  const spaceBelow = vh - rectBottom;
  const spaceAbove = rect.top;
  const placeBelow =
    placement === "bottom"
      ? spaceBelow >= CARD_HEIGHT_ESTIMATE + CARD_GAP || spaceBelow >= spaceAbove
      : !(spaceAbove >= CARD_HEIGHT_ESTIMATE + CARD_GAP || spaceAbove > spaceBelow);

  // Căn giữa card theo tâm target, clamp trong viewport.
  const idealLeft = rect.left + rect.width / 2 - width / 2;
  const left = Math.min(
    Math.max(idealLeft, EDGE_PAD),
    Math.max(EDGE_PAD, vw - width - EDGE_PAD)
  );

  if (placeBelow) return { top: rectBottom + CARD_GAP, left };
  return { bottom: vh - rect.top + CARD_GAP, left };
}

export function ProductTour({ steps = TOUR_STEPS, onDone }: ProductTourProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  // Target có selector nhưng chưa tìm thấy sau khi poll hết hạn → fallback giữa.
  const [targetMissing, setTargetMissing] = useState(false);
  // Đã từng tìm thấy target của bước hiện tại (để khi target biến mất sau đó
  // thì fallback card giữa thay vì kẹt ở trạng thái chờ).
  const hadRectRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  // Ref giữ onDone mới nhất cho listener ESC đăng ký 1 lần (tránh stale closure).
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const step = steps[index];

  // Portal chỉ tồn tại ở client (createPortal cần document.body).
  useEffect(() => {
    setMounted(true);
  }, []);

  // Khoá scroll nền + ESC = skip — đăng ký 1 lần lúc mount (pattern ConfirmModal.tsx:68-86).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDoneRef.current("skipped");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const measure = useCallback(() => {
    const selector = steps[index]?.target;
    if (!selector) {
      setRect(null);
      setTargetMissing(false);
      return;
    }
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) {
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      hadRectRef.current = true;
      setTargetMissing(false);
    } else {
      setRect(null);
      // Target từng có mà nay mất (element unmount) → fallback giữa, không kẹt chờ.
      if (hadRectRef.current) setTargetMissing(true);
    }
  }, [index, steps]);

  // Đo ngay khi đổi bước + poll chờ target xuất hiện (trang có skeleton/fetch).
  useEffect(() => {
    hadRectRef.current = false; // bước mới — reset trạng thái "đã từng thấy target"
    measure();
    const selector = steps[index]?.target;
    if (!selector) return;

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        hadRectRef.current = true;
        setTargetMissing(false);
        window.clearInterval(timer);
      } else if (tries >= POLL_MAX_TRIES) {
        setTargetMissing(true); // từ bỏ → card giữa màn hình thay vì crash
        window.clearInterval(timer);
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [index, steps, measure]);

  // Re-measure khi resize/scroll (scroll capture bắt cả scroll trong container con)
  // — chống lệch spotlight khi layout dịch (sidebar hover scale, skeleton ẩn dần).
  useEffect(() => {
    const handler = () => measure();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [measure]);

  if (!mounted || !step) return null;

  const isLast = index === steps.length - 1;
  const isFirst = index === 0;
  const cardPosition = computeCardPosition(rect, step.placement);

  const goNext = () => {
    if (isLast) onDoneRef.current("completed");
    else setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  // Nội dung card dùng chung cho cả 2 kiểu vị trí (cạnh target / giữa màn hình).
  const cardContent = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
        Bước {index + 1}/{steps.length}
      </p>
      <h2 className="mt-1.5 text-lg font-bold leading-snug text-foreground">
        {step.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

      {/* Progress dots */}
      <div className="mt-4 flex items-center gap-1.5">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDoneRef.current("skipped")}
          data-testid="tour-skip"
          className="mr-auto text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Bỏ qua tour
        </button>
        <button
          type="button"
          onClick={goBack}
          disabled={isFirst}
          data-testid="tour-back"
          className="h-9 rounded-lg border border-border bg-background px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          Quay lại
        </button>
        <button
          type="button"
          onClick={goNext}
          data-testid="tour-next"
          className="h-9 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {isLast ? "Hoàn thành" : "Tiếp theo"}
        </button>
      </div>
    </>
  );

  // Bước có selector nhưng target chưa xuất hiện và poll chưa hết hạn → chờ,
  // chỉ render nền tối để tránh card nhảy vị trí (trạng thái nhất thời < ~3s).
  const waitingForTarget = Boolean(step.target) && !rect && !targetMissing;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={step.title} data-testid="product-tour">
      {/* Lớp nền trong suốt — chặn mọi pointer event về trang bên dưới */}
      <div className="fixed inset-0 z-[10000]" aria-hidden="true" />

      {/* Spotlight: lỗ sáng đúng rect target, màn tối ở xung quanh nhờ box-shadow */}
      {rect ? (
        <motion.div
          className="pointer-events-none fixed z-[10001] rounded-xl ring-2 ring-primary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)",
          }}
          data-testid="product-tour-spotlight"
          aria-hidden="true"
        />
      ) : (
        <div className="fixed inset-0 z-[10001] bg-slate-950/70" aria-hidden="true" />
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        {cardPosition && !waitingForTarget ? (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="fixed z-[10002] w-[360px] max-w-[calc(100vw-16px)] rounded-2xl border border-border bg-card p-5 shadow-2xl"
            style={cardPosition}
            data-testid="product-tour-card"
          >
            {cardContent}
          </motion.div>
        ) : (
          !waitingForTarget && (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="pointer-events-none fixed inset-0 z-[10002] flex items-center justify-center px-2"
            >
              <div
                className="pointer-events-auto w-[360px] max-w-full rounded-2xl border border-border bg-card p-5 shadow-2xl"
                data-testid="product-tour-card"
              >
                {cardContent}
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>,
    document.body
  );
}
