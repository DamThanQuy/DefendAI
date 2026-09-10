"use client";

import React, { useRef, useState } from "react";
import { MAX_FILE_SIZE } from "@/lib/constants";
import { ChunkedUploader } from "@/lib/chunked-upload";

// File nhỏ dùng FormData upload truyền thống (nhanh, ít overhead).
// File >= ngưỡng này chuyển sang chunked (S3 Multipart) để bypass giới hạn 1MB của Next.js BFF.
const CHUNKED_THRESHOLD = 4 * 1024 * 1024; // 4 MB

type Props = {
  onFileSelected?: (file: File) => void;
  onDone?: () => void;
  title?: string;
  description?: string;
  accept?: string;
  buttonLabel?: string;
};

export function UploadZone({
  onFileSelected,
  onDone,
  title = "Kéo thả hoặc chọn tệp",
  description = "Hỗ trợ định dạng PDF, DOCX, ZIP, RAR (Tối đa 100MB)",
  accept = ".pdf,.docx,.zip,.rar",
  buttonLabel = "Chọn từ máy tính",
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // Tốc độ upload (MB/s) + ETA — tính từ lịch sử onProgress
  const [speed, setSpeed] = useState(0); // bytes/sec
  const [eta, setEta] = useState<number | null>(null); // seconds remaining
  const lastSampleRef = useRef<{ ts: number; loaded: number } | null>(null);
  const speedSamplesRef = useRef<number[]>([]);

  const updateProgress = (loaded: number, total: number) => {
    const now = Date.now();
    const last = lastSampleRef.current;
    if (last && now > last.ts) {
      const dtSec = (now - last.ts) / 1000;
      const dBytes = loaded - last.loaded;
      if (dtSec > 0 && dBytes >= 0) {
        const instSpeed = dBytes / dtSec; // bytes/sec
        // EMA để mượt: alpha 0.4
        const samples = speedSamplesRef.current;
        samples.push(instSpeed);
        if (samples.length > 5) samples.shift();
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        setSpeed(avg);
        const remaining = Math.max(0, total - loaded);
        setEta(avg > 0 ? remaining / avg : null);
      }
    }
    lastSampleRef.current = { ts: now, loaded };
    const pct = Math.round((loaded / total) * 100);
    setProgress(pct);
    setStatusText(
      `Đang tải tài liệu lên... ${(loaded / 1024 / 1024).toFixed(1)}/${(total / 1024 / 1024).toFixed(1)} MB`,
    );
  };

  const resetProgressTracking = () => {
    lastSampleRef.current = null;
    speedSamplesRef.current = [];
    setSpeed(0);
    setEta(null);
    setProgress(0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      selectFile(e.dataTransfer.files[0]);
    }
  };

  // Kiểm tra kích thước trước khi nhận file (khớp MAX_FILE_SIZE backend, 10GB)
  const selectFile = (f: File): boolean => {
    setError("");
    if (f.size > MAX_FILE_SIZE) {
      setError(`Tệp vượt quá ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB. Vui lòng chọn tệp nhỏ hơn.`);
      return false;
    }
    setFile(f);
    setUploaded(false);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      selectFile(e.target.files[0]);
    }
  };

  const processFile = async () => {
    if (!file) return;

    if (onFileSelected) {
      onFileSelected(file);
    }

    setStatusText(
      file.size >= CHUNKED_THRESHOLD
        ? "Đang tải tài liệu lên (chunked)..."
        : "Đang tải tài liệu lên...",
    );
    setIsProcessing(true);
    resetProgressTracking();

    const ac = new AbortController();
    setAbortController(ac);
    let uploader: ChunkedUploader | null = null;

    try {
      const token = localStorage.getItem("access_token");
      if (file.size >= CHUNKED_THRESHOLD) {
        // File lớn → dùng chunked (S3 Multipart) qua MinIO presigned URLs
        uploader = new ChunkedUploader(file, {
          concurrency: 3,
          signal: ac.signal,
          onProgress: (uploaded, total) => {
            updateProgress(uploaded, total);
          },
        });
        const result = await uploader.start();
        if (result?.document_id) {
          setUploaded(true);
        } else {
          setError("Tải lên thất bại: không nhận được document_id");
        }
      } else {
        // File nhỏ → FormData truyền thống (nhanh, ít overhead).
        // Dùng XMLHttpRequest thay vì fetch để có progress event (fetch không expose upload progress).
        await new Promise<void>((resolve, reject) => {
          const formData = new FormData();
          formData.append("file", file);
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/documents/upload");
          if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) updateProgress(e.loaded, e.total);
          };
          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText || "{}");
              if (xhr.status >= 200 && xhr.status < 300 && data.success) {
                setUploaded(true);
                resolve();
              } else {
                const msg =
                  data.error || data.detail?.detail || data.message || `HTTP ${xhr.status}`;
                setError(msg);
                reject(new Error(msg));
              }
            } catch (e) {
              setError("Phản hồi từ server không hợp lệ");
              reject(e);
            }
          };
          xhr.onerror = () => {
            setError("Không thể kết nối đến máy chủ");
            reject(new Error("network"));
          };
          ac.signal.addEventListener("abort", () => xhr.abort());
          xhr.send(formData);
        });
      }
    } catch (error: any) {
      if (error?.name === "AbortError") {
        // Hủy thì cleanup parts trên MinIO (nếu chunked)
        if (uploader) await uploader.abort();
        handleCancel();
        return;
      }
      console.error(error);
      setError(
        error?.message ?? "Không thể kết nối đến máy chủ phân tích",
      );
    } finally {
      setIsProcessing(false);
      setAbortController(null);
    }
  };

  const handleCancel = async () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsProcessing(false);
    setFile(null);
    setUploaded(false);
    setProgress(0);
    setStatusText("");
    setError("");
    setSpeed(0);
    setEta(null);
    speedSamplesRef.current = [];
    lastSampleRef.current = null;
  };

  return (
    <div className="w-full relative h-full">
      {/* CSS keyframes cho step indicator */}
      <style>{`
        @keyframes step-pop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes step-ring {
          0% { box-shadow: 0 0 0 0 rgba(13,148,136,0.35); }
          100% { box-shadow: 0 0 0 10px rgba(13,148,136,0); }
        }
        @keyframes step-grow {
          0% { transform: scaleX(0.2); opacity: 0; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        @keyframes step-check {
          0% { transform: scale(0) rotate(-20deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .step-pop { animation: step-pop 0.35s ease-out both; }
        .step-ring { animation: step-ring 1.2s ease-out infinite; }
        .step-grow { transform-origin: left; animation: step-grow 0.4s ease-out both; }
        .step-check { animation: step-check 0.3s ease-out 0.1s both; }
      `}</style>
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {[
          { n: 1, label: "Chọn tài liệu" },
          { n: 2, label: "Tải lên" },
        ].map((s, i) => {
          const current = !file ? 1 : 2;
          const done = s.n < current;
          const active = s.n === current;
          return (
            <React.Fragment key={s.n}>
              {i > 0 && (
                <div className={`h-0.5 w-8 sm:w-12 rounded-full transition-colors ${done ? "step-grow bg-primary" : "bg-muted"}`} />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ${
                    active
                      ? "step-pop bg-primary text-primary-foreground ring-4 ring-primary/20 step-ring"
                      : done
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <span className="step-check">✓</span> : s.n}
                </div>
                <span className={`text-[13px] font-semibold transition-colors ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div
        className={`w-full h-full border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 ease-in-out cursor-pointer flex flex-col items-center justify-center min-h-[460px] relative overflow-hidden bg-card ${
          isDragging
            ? "border-primary bg-teal-500/10"
            : "border-border hover:border-primary/40"
        } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!isProcessing && !file) document.getElementById("file-upload")?.click();
        }}
      >
        <div className={`w-[72px] h-[72px] rounded-full mb-8 flex items-center justify-center transition-all duration-300 ${isDragging ? "bg-teal-500/20 scale-110" : "bg-teal-500/10"}`}>
          <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        
        {file ? (
          <div className="space-y-4 w-full max-w-xs mx-auto">
            <h3 className="text-xl font-bold text-foreground truncate px-4">{file.name}</h3>
            <div className="inline-block px-4 py-1.5 bg-teal-500/10 text-primary rounded-full text-xs font-semibold">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>

            {/* Bước 1b: Chưa upload → nút "Tải lên" */}
            {!isProcessing && !uploaded && (
              <div className="flex flex-col gap-3 pt-4 border-t border-border/60">
                <button onClick={(e) => { e.stopPropagation(); processFile(); }} className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full shadow-md transition-colors text-sm">
                  Tải lên
                </button>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setUploaded(false); }} className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Hủy & Chọn tệp khác
                </button>
              </div>
            )}

            {/* Bước 2: Đã upload xong */}
            {!isProcessing && uploaded && (
              <div className="pt-4 border-t border-border/60">
                <div className="flex items-center justify-center gap-2 mb-3 text-green-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-[14px] font-semibold">Đã tải lên thành công</span>
                </div>
                <p className="text-[13px] text-muted-foreground text-center mb-4">Dùng nút ➕ Workspace trong danh sách để đưa tài liệu vào workspace và tạo câu hỏi AI.</p>
                <button onClick={(e) => { e.stopPropagation(); onDone?.(); }} className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-full shadow-md transition-colors text-sm">
                  Xong
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <h3 className="text-[22px] font-bold mb-3 text-foreground tracking-tight">{title}</h3>
            <p className="text-muted-foreground mb-10 text-[15px] font-medium">
              {description}
            </p>
            <button className="px-8 py-2.5 bg-primary text-primary-foreground font-semibold rounded-full hover:bg-primary/90 transition-colors text-sm shadow-sm pointer-events-none">
              {buttonLabel}
            </button>
          </div>
        )}
        <input id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept={accept} />
      </div>

      {/* Error Banner — hiển thị bền sau khi xử lý kết thúc */}
      {error && (
        <div className="mt-4 flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-[14px] font-semibold text-red-400 mb-1">Không thể tải tài liệu này</p>
            <p className="text-[13px] text-red-400 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm rounded-2xl border border-border/60">
          <div className="w-14 h-14 border-[3px] border-teal-500/20 border-t-primary rounded-full animate-spin mb-6"></div>
          <h3 className="text-[17px] font-bold text-foreground">{statusText}</h3>
          <div className="w-64 h-2 bg-muted rounded-full mt-4 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2 font-medium">{progress}%</p>
          {speed > 0 && (
            <p className="text-[12px] text-muted-foreground mt-1 tabular-nums">
              {(speed / 1024 / 1024).toFixed(2)} MB/s
              {eta !== null && eta > 0 && (
                <span className="ml-2">
                  · còn ~{eta < 60 ? `${Math.ceil(eta)}s` : `${Math.ceil(eta / 60)}m ${Math.ceil(eta % 60)}s`}
                </span>
              )}
            </p>
          )}
          <button
            onClick={handleCancel}
            className="mt-6 px-6 py-2 text-sm font-medium text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-400 rounded-full transition-all"
          >
            Hủy quá trình
          </button>
        </div>
      )}
    </div>
  );
}
