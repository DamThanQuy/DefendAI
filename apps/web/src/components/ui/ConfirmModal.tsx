"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type ConfirmTone = "danger" | "warning" | "info";

export interface ConfirmModalProps {
  open: boolean;
  tone?: ConfirmTone;
  title: string;
  description?: React.ReactNode;
  icon?: string; // Material Symbols ligature name, e.g. "delete", "warning", "restore"
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TONE_STYLES: Record<ConfirmTone, { ring: string; iconBg: string; iconText: string; btn: string }> = {
  danger: {
    ring: "ring-red-500/20",
    iconBg: "bg-red-500/10",
    iconText: "text-red-500",
    btn: "bg-red-500 hover:bg-red-600 text-white",
  },
  warning: {
    ring: "ring-amber-500/20",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-500",
    btn: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  info: {
    ring: "ring-primary/20",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    btn: "bg-primary hover:bg-primary/90 text-primary-foreground",
  },
};

const TONE_ICON: Record<ConfirmTone, string> = {
  danger: "delete",
  warning: "warning",
  info: "info",
};

export function ConfirmModal({
  open,
  tone = "danger",
  title,
  description,
  icon,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const styles = TONE_STYLES[tone];
  const iconName = icon ?? TONE_ICON[tone];

  // Focus confirm button khi mở + ESC để huỷ
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  // Khoá scroll nền
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !loading && onCancel()}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`relative z-10 w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl ring-1 ${styles.ring} overflow-hidden animate-fade-in-up`}
      >
        <div className="p-6 flex gap-4">
          <div
            className={`shrink-0 w-12 h-12 rounded-full ${styles.iconBg} flex items-center justify-center`}
          >
            <span className={`material-icons text-[28px] ${styles.iconText}`}>{iconName}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-modal-title"
              className="text-[17px] font-bold text-foreground mb-1.5"
            >
              {title}
            </h2>
            {description ? (
              <div className="text-[14px] text-muted-foreground leading-relaxed">
                {description}
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-6 py-4 bg-muted/30 border-t border-border flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 h-9 rounded-lg text-[13px] font-semibold text-foreground bg-background border border-border hover:bg-muted transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 h-9 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50 ${styles.btn}`}
          >
            {loading ? "Đang xử lý..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
