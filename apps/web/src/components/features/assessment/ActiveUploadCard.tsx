"use client";

import React from "react";

type UploadStatus = "uploading" | "success" | "error";

type ActiveUpload = {
  id: string;
  filename: string;
  progress: number;
  loaded: number;
  total: number;
  speed: number;
  eta: number | null;
  status: UploadStatus;
  error?: string;
};

type Props = {
  uploads: ActiveUpload[];
  onDismiss: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
};

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

export function ActiveUploadCard({ uploads, onDismiss, onCancel, onRetry }: Props) {
  if (!uploads.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm space-y-3">
      {uploads.map((u) => (
        <div
          key={u.id}
          className={`rounded-2xl border border-border/60 bg-card shadow-2xl p-4 transition-colors ${
            u.status === "error" ? "border-red-500/40" : u.status === "success" ? "border-emerald-500/40" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">{u.filename}</p>
              <p className="text-[12px] text-zinc-500 mt-0.5">
                {u.status === "uploading" && (
                  <>
                    {formatBytes(u.loaded)} / {formatBytes(u.total)} · {formatBytes(u.speed)}/s · {formatEta(u.eta)}
                  </>
                )}
                {u.status === "success" && "Đã tải lên thành công"}
                {u.status === "error" && (u.error || "Tải lên thất bại")}
              </p>
            </div>
            {u.status === "uploading" && (
              <button
                onClick={() => onDismiss(u.id)}
                className="text-zinc-500 hover:text-foreground transition-colors"
                aria-label="Thu nhỏ"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>

          {u.status === "uploading" && (
            <div className="mt-3">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, u.progress)}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1 font-medium tabular-nums">{Math.min(100, u.progress)}%</p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            {u.status === "uploading" && (
              <button
                onClick={() => onCancel(u.id)}
                className="px-3 py-1.5 text-[12px] font-semibold text-red-400 border border-red-500/20 rounded-full hover:border-red-400 transition-colors"
              >
                Hủy
              </button>
            )}
            {u.status === "error" && (
              <button
                onClick={() => onRetry(u.id)}
                className="px-3 py-1.5 text-[12px] font-semibold text-primary-foreground bg-primary rounded-full hover:bg-primary/90 transition-colors"
              >
                Thử lại
              </button>
            )}
            {u.status === "success" && (
              <button
                onClick={() => onDismiss(u.id)}
                className="px-3 py-1.5 text-[12px] font-semibold text-zinc-300 hover:text-foreground transition-colors"
              >
                Đóng
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
