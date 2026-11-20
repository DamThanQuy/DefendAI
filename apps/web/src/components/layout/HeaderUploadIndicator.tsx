"use client";

import React, { useState, useRef, useEffect } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, X, RotateCcw } from "lucide-react";
import { useUpload } from "@/contexts/UploadContext";
import { AnimatePresence, motion } from "framer-motion";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  if (seconds <= 0) return "còn ~0s";
  if (seconds < 60) return `còn ~${Math.ceil(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `còn ~${m}m ${s}s`;
}

export function HeaderUploadIndicator() {
  const { uploads, cancelUpload, retryUpload, dismissUpload } = useUpload();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (!uploads.length) return null;

  // Tính toán trạng thái tổng quan
  const hasError = uploads.some((u) => u.status === "error");
  const isAllSuccess = uploads.every((u) => u.status === "success");
  const uploadingList = uploads.filter((u) => u.status === "uploading");

  // Tính phần trăm trung bình của các file đang tải
  const avgProgress =
    uploadingList.length > 0
      ? Math.round(
          uploadingList.reduce((acc, u) => acc + (u.progress || 0), 0) / uploadingList.length,
        )
      : isAllSuccess
      ? 100
      : 0;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Nút chỉ báo tiến trình trên Header */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 h-9 px-3 rounded-full text-xs font-semibold transition-all shadow-sm ${
          hasError
            ? "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20"
            : isAllSuccess
            ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
            : "bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 shadow-[0_0_12px_rgba(20,184,166,0.15)]"
        }`}
        aria-label="Tiến trình tải lên"
        title="Bấm để xem chi tiết tiến trình tải lên"
      >
        {hasError ? (
          <AlertCircle className="w-4 h-4 text-red-400 animate-pulse shrink-0" />
        ) : isAllSuccess ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
            <div className="w-3.5 h-3.5 border-2 border-teal-400/30 border-t-teal-400 rounded-full animate-spin" />
          </div>
        )}

        <span className="tabular-nums font-mono font-bold">
          {hasError ? "Lỗi tải" : isAllSuccess ? "Đã xong" : `↑ ${avgProgress}%`}
        </span>
      </button>

      {/* Dropdown danh sách chi tiết tiến trình */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-primary" />
                <span className="text-[13px] font-bold text-foreground">Tiến trình tải lên</span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {uploads.length}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-3 pr-0.5">
              {uploads.map((u) => (
                <div
                  key={u.id}
                  className={`rounded-xl border p-3 transition-colors ${
                    u.status === "error"
                      ? "border-red-500/30 bg-red-500/5"
                      : u.status === "success"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-border/60 bg-muted/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate" title={u.filename}>
                        {u.filename}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {u.status === "uploading" && (
                          <>
                            {formatBytes(u.loaded)} / {formatBytes(u.total)} · {formatBytes(u.speed)}/s · {formatEta(u.eta)}
                          </>
                        )}
                        {u.status === "success" && "Đã tải lên hoàn tất"}
                        {u.status === "error" && (u.error || "Tải lên thất bại")}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {u.status === "uploading" && (
                        <button
                          onClick={() => cancelUpload(u.id)}
                          className="px-2 py-1 text-[11px] font-semibold text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-400/40 rounded-lg transition-colors"
                          title="Hủy tải lên"
                        >
                          Hủy
                        </button>
                      )}
                      {u.status === "error" && (
                        <button
                          onClick={() => retryUpload(u.id)}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                          title="Thử lại"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-teal-400" />
                        </button>
                      )}
                      <button
                        onClick={() => dismissUpload(u.id)}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                        title="Đóng"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {u.status === "uploading" && (
                    <div className="mt-2.5">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${Math.min(100, u.progress)}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {Math.min(100, u.progress)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
