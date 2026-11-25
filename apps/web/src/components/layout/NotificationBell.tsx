"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Bell,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
  CheckCheck,
  Trash2,
  Sparkles,
  Info,
} from "lucide-react";
import { useUpload } from "@/contexts/UploadContext";
import { AnimatePresence, motion } from "framer-motion";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: "upload_success" | "upload_error" | "system";
};

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [];

const STORAGE_KEY = "defendai_notifications_history";

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

function formatTimeAgo(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "vừa xong";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} ngày trước`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const { uploads, cancelUpload, retryUpload, dismissUpload } = useUpload();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [hasRecentSuccess, setHasRecentSuccess] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recordedUploadsRef = useRef<Set<string>>(new Set());

  // Khởi tạo notifications từ localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNotifications(parsed);
          return;
        }
      }
    } catch {
      // Bỏ qua lỗi parse
    }
    setNotifications(DEFAULT_NOTIFICATIONS);
  }, []);

  // Đồng bộ notifications vào localStorage
  const saveNotifications = useCallback((items: NotificationItem[]) => {
    setNotifications(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Bỏ qua lỗi quota storage
    }
  }, []);

  // Theo dõi tiến trình tải lên để tự động ghi lịch sử thông báo khi hoàn tất hoặc lỗi
  useEffect(() => {
    let newItemsAdded = false;
    let updatedList = [...notifications];

    uploads.forEach((u) => {
      if (u.status === "success") {
        const key = `${u.id}-success`;
        if (!recordedUploadsRef.current.has(key)) {
          recordedUploadsRef.current.add(key);
          const newItem: NotificationItem = {
            id: `upload-ok-${u.id}-${Date.now()}`,
            title: "Tải lên thành công",
            message: `Tài liệu "${u.filename}" đã được tải lên và sẵn sàng phân tích.`,
            timestamp: Date.now(),
            read: false,
            type: "upload_success",
          };
          updatedList = [newItem, ...updatedList.slice(0, 19)];
          newItemsAdded = true;
          setHasRecentSuccess(true);
          setTimeout(() => setHasRecentSuccess(false), 8000);
        }
      } else if (u.status === "error") {
        const key = `${u.id}-error`;
        if (!recordedUploadsRef.current.has(key)) {
          recordedUploadsRef.current.add(key);
          const newItem: NotificationItem = {
            id: `upload-err-${u.id}-${Date.now()}`,
            title: "Tải lên thất bại",
            message: `Tài liệu "${u.filename}": ${u.error || "Có lỗi xảy ra khi tải tệp lên."}`,
            timestamp: Date.now(),
            read: false,
            type: "upload_error",
          };
          updatedList = [newItem, ...updatedList.slice(0, 19)];
          newItemsAdded = true;
        }
      } else if (u.status === "uploading") {
        // Cho phép ghi nhận lại nếu retry
        recordedUploadsRef.current.delete(`${u.id}-error`);
      }
    });

    if (newItemsAdded) {
      saveNotifications(updatedList);
    }
  }, [uploads, notifications, saveNotifications]);

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

  // Tính toán trạng thái uploads
  const uploadingList = useMemo(() => uploads.filter((u) => u.status === "uploading"), [uploads]);
  const hasError = useMemo(() => uploads.some((u) => u.status === "error"), [uploads]);
  const isUploading = uploadingList.length > 0;

  const avgProgress = useMemo(() => {
    if (uploadingList.length === 0) return 0;
    return Math.round(
      uploadingList.reduce((acc, u) => acc + (u.progress || 0), 0) / uploadingList.length,
    );
  }, [uploadingList]);

  // Số lượng thông báo chưa đọc
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  // Đánh dấu tất cả đã đọc
  const handleMarkAllAsRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    saveNotifications(updated);
  };

  // Đánh dấu 1 item đã đọc
  const handleMarkAsRead = (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    saveNotifications(updated);
  };

  // Xoá lịch sử
  const handleClearHistory = () => {
    saveNotifications([]);
  };

  // Thông số cho SVG Circular Progress Ring
  const ringRadius = 13;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - Math.min(100, Math.max(0, avgProgress)) / 100);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Nút Chuông Đa Năng */}
      {isUploading ? (
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 h-9 px-3 rounded-full text-xs font-semibold transition-all shadow-sm bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 shadow-[0_0_12px_rgba(20,184,166,0.15)] cursor-pointer"
          aria-label={`Tiến trình tải lên ${avgProgress}%`}
          title={`Đang tải ${uploadingList.length} tệp (${avgProgress}%)`}
        >
          {/* Circular Progress Ring bao quanh Bell icon */}
          <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 32 32">
              <circle
                cx="16"
                cy="16"
                r={ringRadius}
                fill="none"
                className="stroke-teal-500/20"
                strokeWidth="2.5"
              />
              <circle
                cx="16"
                cy="16"
                r={ringRadius}
                fill="none"
                className="stroke-teal-400 transition-all duration-300 ease-out"
                strokeWidth="2.5"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
              />
            </svg>
            <Bell className="w-3 h-3 text-teal-400" />
          </div>
          <span className="tabular-nums font-mono font-bold text-teal-400">
            ↑ {avgProgress}%
          </span>
        </button>
      ) : hasError ? (
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-full text-xs font-semibold transition-all shadow-sm bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 cursor-pointer"
          aria-label="Có lỗi khi tải lên"
          title="Có lỗi trong quá trình tải tệp"
        >
          <AlertCircle className="w-4 h-4 text-red-400 animate-pulse shrink-0" />
          <span className="font-medium text-xs hidden sm:inline">Lỗi tải</span>
        </button>
      ) : hasRecentSuccess ? (
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-full text-xs font-semibold transition-all shadow-sm bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer"
          aria-label="Tải lên thành công"
          title="Tải lên tài liệu hoàn tất"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium text-xs hidden sm:inline">Đã xong</span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label="Thông báo & Tác vụ"
          title="Thông báo & Tác vụ"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.8)]" />
          )}
        </button>
      )}

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-11 z-50 w-84 sm:w-96 rounded-2xl border border-border/80 bg-card shadow-2xl p-4 space-y-4 max-h-[85vh] flex flex-col"
          >
            {/* Header Dropdown */}
            <div className="flex items-center justify-between pb-3 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Thông báo & Tác vụ</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                    {unreadCount} mới
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                aria-label="Đóng bảng thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!user ? (
              <div className="py-6 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Bell className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-foreground">Bạn chưa đăng nhập</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Vui lòng đăng nhập để xem thông báo tiến trình đồ án, mock defense và nhận xét của AI.
                </p>
                <Link href="/login" onClick={() => setIsOpen(false)} className="block pt-2">
                  <Button size="sm" className="w-full rounded-full">
                    Đăng nhập ngay
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-y-auto space-y-4 pr-0.5 flex-1 custom-scrollbar">
              {/* Section 1: Active Uploads (nếu có tác vụ tải lên) */}
              {uploads.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <UploadCloud className="w-3.5 h-3.5 text-teal-400" />
                      <span>Tiến trình tải lên</span>
                    </div>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-full bg-muted">
                      {isUploading
                        ? `${uploadingList.length}/${uploads.length}`
                        : `${uploads.length} tác vụ`}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {uploads.map((u) => (
                      <div
                        key={u.id}
                        className={`rounded-xl border p-3 transition-colors ${
                          u.status === "error"
                            ? "border-red-500/30 bg-red-500/5"
                            : u.status === "success"
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-teal-500/30 bg-teal-500/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-xs font-semibold text-foreground truncate"
                              title={u.filename}
                            >
                              {u.filename}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {u.status === "uploading" && (
                                <>
                                  {formatBytes(u.loaded)} / {formatBytes(u.total)} ·{" "}
                                  {formatBytes(u.speed)}/s · {formatEta(u.eta)}
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
                                className="px-2 py-0.5 text-[11px] font-semibold text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-400/40 rounded-lg transition-colors cursor-pointer"
                                title="Hủy tải lên"
                              >
                                Hủy
                              </button>
                            )}
                            {u.status === "error" && (
                              <button
                                onClick={() => retryUpload(u.id)}
                                className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                                title="Thử lại"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-teal-400" />
                              </button>
                            )}
                            <button
                              onClick={() => dismissUpload(u.id)}
                              className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                              title="Ẩn"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {u.status === "uploading" && (
                          <div className="mt-2">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-teal-400 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(100, u.progress)}%` }}
                              />
                            </div>
                            <div className="flex justify-between items-center mt-1">
                              <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                {Math.min(100, u.progress)}%
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 2: Recent Notifications (Thông báo gần đây) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                  <span>Thông báo gần đây</span>
                  {notifications.length > 0 && (
                    <span className="text-[11px] text-muted-foreground/70">
                      {notifications.length} mục
                    </span>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="text-center py-6 px-4 rounded-xl border border-dashed border-border/60 text-muted-foreground">
                    <Bell className="w-7 h-7 mx-auto opacity-30 mb-1.5" />
                    <p className="text-xs">Không có thông báo nào</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleMarkAsRead(item.id)}
                        className={`group relative flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                          item.read
                            ? "border-border/40 bg-muted hover:bg-muted/90"
                            : "border-border/80 bg-card hover:bg-muted/30 shadow-xs"
                        }`}
                      >
                        {/* Icon */}
                        <div className="mt-0.5 shrink-0">
                          {item.type === "upload_success" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : item.type === "upload_error" ? (
                            <AlertCircle className="w-4 h-4 text-red-400" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-primary" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <h4
                              className={`text-xs truncate ${
                                item.read
                                  ? "font-medium text-foreground/80"
                                  : "font-bold text-foreground"
                              }`}
                            >
                              {item.title}
                            </h4>
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                              {formatTimeAgo(item.timestamp)}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                            {item.message}
                          </p>
                        </div>

                        {/* Unread dot */}
                        {!item.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer Dropdown */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground shrink-0">
              <button
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
                className="flex items-center gap-1.5 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Đánh dấu đã đọc</span>
              </button>

              <button
                onClick={handleClearHistory}
                disabled={notifications.length === 0}
                className="flex items-center gap-1.5 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa lịch sử</span>
              </button>
            </div>
            </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
