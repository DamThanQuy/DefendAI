"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { UploadModal } from "@/components/features/assessment/UploadModal";
import { toast } from "sonner";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

export type ActiveUpload = {
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

type UploadContextType = {
  uploads: ActiveUpload[];
  showUploadModal: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;
  minimizeUploadModal: () => void;
  handleUploadProgress: (state: {
    file: File | null;
    progress: number;
    loaded: number;
    total: number;
    speed: number;
    eta: number | null;
    status: UploadStatus;
    error?: string;
  }) => void;
  dismissUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  subscribeUploadSuccess: (cb: () => void) => () => void;
};

const UploadContext = createContext<UploadContextType | null>(null);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<ActiveUpload[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const successListenersRef = useRef<Set<() => void>>(new Set());
  const abortHandlersRef = useRef<Map<string, () => Promise<void> | void>>(new Map());
  const cancelledIdsRef = useRef<Set<string>>(new Set());

  const registerAbortHandler = useCallback((id: string, abortFn: () => Promise<void> | void) => {
    cancelledIdsRef.current.delete(id);
    abortHandlersRef.current.set(id, abortFn);
  }, []);

  const subscribeUploadSuccess = useCallback((cb: () => void) => {
    successListenersRef.current.add(cb);
    return () => {
      successListenersRef.current.delete(cb);
    };
  }, []);

  const notifyUploadSuccess = useCallback(() => {
    successListenersRef.current.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("Error in upload success listener:", err);
      }
    });
  }, []);

  const openUploadModal = useCallback(() => {
    setShowUploadModal(true);
  }, []);

  const closeUploadModal = useCallback(() => {
    setShowUploadModal(false);
  }, []);

  const minimizeUploadModal = useCallback(() => {
    setShowUploadModal(false);
  }, []);

  const handleUploadProgress = useCallback(
    (state: {
      file: File | null;
      progress: number;
      loaded: number;
      total: number;
      speed: number;
      eta: number | null;
      status: UploadStatus;
      error?: string;
    }) => {
      const id = state.file
        ? `${state.file.name}:${state.file.size}:${state.file.lastModified}`
        : `upload-${Date.now()}`;
      const filename = state.file?.name ?? "Đang tải lên";

      // Nếu tác vụ đã bị người dùng bấm Hủy, bỏ qua các progress events muộn
      if (cancelledIdsRef.current.has(id)) {
        return;
      }

      setUploads((prev) => {
        const itemStatus: UploadStatus = state.status === "idle" ? "uploading" : state.status;
        const nextItem: ActiveUpload = {
          id,
          filename,
          progress: state.progress,
          loaded: state.loaded,
          total: state.total,
          speed: state.speed,
          eta: state.eta,
          status: itemStatus,
          error: state.error,
        };

        const exists = prev.find((u) => u.id === id);
        const nextList = exists
          ? prev.map((u) => (u.id === id ? nextItem : u))
          : [...prev, nextItem];

        // Nếu vừa chuyển sang success
        if (state.status === "success" && exists?.status !== "success") {
          toast.success(`Đã tải lên thành công: ${filename}`);
          notifyUploadSuccess();
        }

        return nextList;
      });
    },
    [notifyUploadSuccess],
  );

  const dismissUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const cancelUpload = useCallback((id: string) => {
    // 1. Chống double click: nếu ID đã được yêu cầu hủy thì bỏ qua ngay lập tức
    if (cancelledIdsRef.current.has(id)) {
      return;
    }
    cancelledIdsRef.current.add(id);

    // 2. Cập nhật UI ngay lập tức (0ms latency, không chờ mạng)
    setUploads((prev) => prev.filter((u) => u.id !== id));
    toast.info("Đã hủy tải lên tài liệu");

    // 3. Thực thi abort handler (ngắt socket ngay, gọi cleanup server ở background)
    const handler = abortHandlersRef.current.get(id);
    if (handler) {
      abortHandlersRef.current.delete(id);
      try {
        Promise.resolve(handler()).catch((err) => {
          console.warn("Background abort cleanup error:", err);
        });
      } catch (err) {
        console.warn("Immediate abort error:", err);
      }
    }
  }, []);

  const retryUpload = useCallback((id: string) => {
    cancelledIdsRef.current.delete(id);
    setUploads((prev) => prev.filter((u) => u.id !== id));
    setShowUploadModal(true);
  }, []);

  return (
    <UploadContext.Provider
      value={{
        uploads,
        showUploadModal,
        openUploadModal,
        closeUploadModal,
        minimizeUploadModal,
        handleUploadProgress,
        dismissUpload,
        cancelUpload,
        retryUpload,
        subscribeUploadSuccess,
      }}
    >
      {children}

      {/* Global Upload Modal */}
      <UploadModal
        open={showUploadModal}
        onClose={closeUploadModal}
        onMinimize={minimizeUploadModal}
        onProgress={handleUploadProgress}
        onRegisterAbort={registerAbortHandler}
      />
    </UploadContext.Provider>
  );
}

export function useUpload(): UploadContextType {
  const ctx = useContext(UploadContext);
  if (!ctx) {
    throw new Error("useUpload must be used within an UploadProvider");
  }
  return ctx;
}
