"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CodePreview } from "@/components/features/code-review/CodePreview";
import { FileTree } from "@/components/features/assessment/FileTree";
import type { CodeIssue } from "@/types";

type ScanStatus = "idle" | "uploading" | "scanning" | "done" | "rejected" | "error";

interface UploadedDoc {
  id: number;
  filename: string;
  doc_type: string;
  status: string;
  created_at: string;
}

interface ScanResult {
  stats: { critical: number; warnings: number; optimizations: number };
  backendData: { pass_rate: number; summary: string; provider?: string; model?: string };
  details: CodeIssue[];
  documentId?: number;
}

export default function CodeReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<UploadedDoc | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [members, setMembers] = useState<{ path: string; size: number; is_dir: boolean }[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{ path: string; text: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [activeIssue, setActiveIssue] = useState<CodeIssue | null>(null);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "optimization">("all");

  const token = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("access_token") : null),
    []
  );

  const passRate = result?.backendData?.pass_rate ?? 0;
  const percentage = Math.round(passRate * 100);

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Tốt";
    if (score >= 70) return "Khá";
    if (score >= 50) return "Trung bình";
    return "Cần cải thiện";
  };

  const issues = result?.details ?? [];
  const fileCount = useMemo(() => members.filter((m) => !m.is_dir).length, [members]);

  // Lấy nội dung 1 file để preview
  const loadFile = (path: string, docIdOverride?: number) => {
    setSelectedFile(path);
    setActiveIssue(null);
    const docId = docIdOverride ?? result?.documentId;
    if (!docId || !token) return;
    setLoadingFile(true);
    fetch(`/api/documents/${docId}/contents/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Không thể đọc file");
        return r.text();
      })
      .then((text) => setFileContent({ path, text }))
      .catch((e) => setFileContent({ path, text: `// Lỗi đọc file: ${e.message}` }))
      .finally(() => setLoadingFile(false));
  };

  // Click issue → mở file + highlight dòng
  const pickIssue = (issue: CodeIssue) => {
    if (issue.file !== selectedFile || !fileContent) {
      loadFile(issue.file);
    }
    setActiveIssue(issue);
  };

  // Upload mới + scan (hoặc scan lại tài liệu đã upload)
  const startScan = async () => {
    if (!file && !selectedDoc) return;
    setStatus("uploading");
    setErrorMsg("");
    setResult(null);
    setMembers([]);
    setSelectedFile(null);
    setFileContent(null);

    let res: Response;
    try {
      if (selectedDoc) {
        // Mode 2: scan lại tài liệu đã upload
        res = await fetch("/api/code/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ document_id: selectedDoc.id }),
        });
      } else {
        // Mode 1: upload file mới
        const fd = new FormData();
        fd.append("file", file as File);
        res = await fetch("/api/code/scan", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
      }
      const data = await res.json();
      if (data.success) {
        applyResult(data);
      } else if (data.error) {
        setStatus("rejected");
        setErrorMsg(data.error);
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Không thể phân tích file");
      }
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message || "Không thể kết nối máy chủ");
    }
  };

  // Áp kết quả scan/history vào state + tải file tree
  const applyResult = (data: ScanResult) => {
    setStatus("done");
    setResult({ ...data, documentId: data.documentId });
    setActiveIssue(null);
    const docId = data.documentId;
    if (docId && token) {
      fetch(`/api/documents/${docId}/contents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((c) => {
          setMembers(c.items ?? []);
          const firstCode = (c.items ?? []).find(
            (m: any) => !m.is_dir && /\.(py|js|ts|tsx|jsx|java|go|cs|c|cpp|h|php|rb)$/i.test(m.path)
          );
          if (firstCode) loadFile(firstCode.path, docId);
        })
        .catch(() => {});
    }
  };

  // Tải danh sách ZIP/RAR đã upload để chọn lại (reuse tài liệu)
  useEffect(() => {
    if (!token) return;
    fetch("/api/documents/", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        const zips = (d.items ?? []).filter(
          (x: UploadedDoc) => x.doc_type === "zip" || x.doc_type === "rar"
        );
        setUploadedDocs(zips);
      })
      .catch(() => {});
  }, [token]);

  // Query param ?file= để upload nhanh từ nơi khác
  useEffect(() => {
    if (searchParams.get("file")) {
      router.replace("/code-review", { scroll: false });
    }
  }, [searchParams, router]);

  // Query param ?analysis=id → mở lại kết quả code review đã lưu
  useEffect(() => {
    const analysisId = searchParams.get("analysis");
    if (!analysisId || !token) return;
    setStatus("scanning");
    fetch(`/api/code/analyses/${analysisId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.success) {
          setStatus("error");
          setErrorMsg(data.error || "Không thể tải kết quả đã lưu");
          return;
        }
        applyResult(data);
      })
      .catch((e: any) => {
        setStatus("error");
        setErrorMsg(e?.message || "Không thể kết nối máy chủ");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, token]);

  const filteredIssues = issues.filter((i) => {
    const s = i.severity?.toLowerCase();
    if (filter === "critical") return s === "critical" || s === "high";
    if (filter === "warning") return s === "medium";
    if (filter === "optimization") return s === "low" || s === "info";
    return true;
  });

  const severityLabel = (s: string) => {
    const low = s?.toLowerCase() || "low";
    if (low === "critical" || low === "high") return { label: "CRITICAL", bg: "bg-red-500/10", txt: "text-red-400" };
    if (low === "medium") return { label: "WARNING", bg: "bg-orange-500/10", txt: "text-orange-400" };
    return { label: "OPTIMIZATION", bg: "bg-green-500/10", txt: "text-green-400" };
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-8 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[22px] font-bold text-zinc-200 mb-2">Code Review AI</h1>
            <p className="text-zinc-500 text-[15px]">
              Phân tích chất lượng mã nguồn trong file ZIP/RAR của bạn.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.rar"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  setFile(e.target.files[0]);
                  setSelectedDoc(null);
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={status === "uploading" || status === "scanning"}
              className="flex items-center gap-2 px-5 py-2.5 bg-card border border-zinc-700 text-zinc-300 font-semibold text-[14px] rounded-lg hover:bg-zinc-800 transition-colors shadow-sm disabled:opacity-50"
            >
              📁 {file ? file.name : "Chọn file ZIP/RAR"}
            </button>
            {uploadedDocs.length > 0 && (
              <button
                onClick={() => setShowDocPicker(true)}
                disabled={status === "uploading" || status === "scanning"}
                className="flex items-center gap-2 px-5 py-2.5 bg-card border border-dashed border-teal-500/40 text-teal-400 font-semibold text-[14px] rounded-lg hover:bg-teal-500/10 transition-colors shadow-sm disabled:opacity-50"
              >
                🗂️ {selectedDoc ? selectedDoc.filename : "Chọn từ đã upload"}
              </button>
            )}
            <Link
              href="/code-review/history"
              className="flex items-center gap-2 px-5 py-2.5 bg-card border border-zinc-700 text-zinc-300 font-semibold text-[14px] rounded-lg hover:bg-zinc-800 transition-colors shadow-sm"
            >
              🕘 Lịch sử
            </Link>
            <button
              onClick={startScan}
              disabled={(!file && !selectedDoc) || status === "uploading" || status === "scanning"}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
            >
              {status === "uploading" || status === "scanning" ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang phân tích...
                </>
              ) : (
                "🔍 Chạy Code Review"
              )}
            </button>
          </div>
        </div>

        {/* Modal: chọn từ tài liệu đã upload */}
        {showDocPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowDocPicker(false)}>
            <div
              className="bg-card rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh] border border-zinc-800/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60">
                <h3 className="text-[15px] font-bold text-zinc-200">🗂️ Chọn file ZIP/RAR đã tải lên</h3>
                <button
                  onClick={() => setShowDocPicker(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-500"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {uploadedDocs.length === 0 && (
                  <p className="text-zinc-500 text-[13px] p-4">Chưa có file ZIP/RAR nào được tải lên.</p>
                )}
                {uploadedDocs.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelectedDoc(d);
                      setFile(null);
                      setShowDocPicker(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-teal-500/10 transition-colors ${selectedDoc?.id === d.id ? "bg-teal-500/10" : ""}`}
                  >
                    <span className="text-lg">🗜️</span>
                    <span className="flex-1 text-[13px] font-semibold text-zinc-200 truncate">{d.filename}</span>
                    <span className="text-[11px] text-zinc-500">
                      {d.doc_type === "rar" ? "RAR" : "ZIP"} • {new Date(d.created_at).toLocaleDateString("vi-VN")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Idle: hướng dẫn */}
        {status === "idle" && !result && (
          <div className="bg-card rounded-2xl border-2 border-dashed border-zinc-700 p-16 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-bold text-zinc-200 mb-2">Chọn file ZIP/RAR chứa source code</h2>
            <p className="text-zinc-500 text-[14px] max-w-md mx-auto">
              Tải file mới lên hoặc chọn lại một file ZIP/RAR đã tải lên trước đó để phân tích lại.
            </p>
          </div>
        )}

        {/* Rejected: file không phải source code */}
        {status === "rejected" && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">🚫</div>
            <h2 className="text-lg font-bold text-red-400 mb-2">File này không được xác định là source code</h2>
            <p className="text-[14px] text-red-400 max-w-xl mx-auto leading-relaxed mb-4">{errorMsg}</p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-card border border-red-500/40 text-red-400 font-semibold text-[13px] rounded-lg hover:bg-red-500/10 transition-colors"
              >
                Chọn file khác
              </button>
              <Link
                href="/documents"
                className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[13px] rounded-lg hover:bg-primary/90 transition-colors"
              >
                📄 Dùng luồng Đọc Tài liệu
              </Link>
            </div>
          </div>
        )}

        {/* Error khác */}
        {status === "error" && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
            <p className="text-red-400 font-semibold mb-1">Đã xảy ra lỗi</p>
            <p className="text-[13px] text-red-400">{errorMsg}</p>
          </div>
        )}

        {/* Đang xử lý */}
        {(status === "uploading" || status === "scanning") && (
          <div className="bg-card rounded-2xl p-12 text-center">
            <div className="w-10 h-10 border-[3px] border-zinc-800 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-400 font-medium">
              {status === "uploading" ? "Đang tải file lên..." : "Đang phân tích mã nguồn... (có thể mất 1-2 phút)"}
            </p>
          </div>
        )}

        {/* Done: 3-panel review */}
        {status === "done" && result && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-card rounded-xl shadow-sm border border-zinc-800/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center text-lg font-bold">
                  {percentage}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Điểm chất lượng</div>
                  <div className="text-[14px] font-bold text-zinc-200">{getScoreLabel(percentage)}</div>
                </div>
              </div>
              <div className="bg-card rounded-xl shadow-sm border border-zinc-800/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-lg font-bold">
                  {result.stats?.critical ?? 0}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Lỗi nghiêm trọng</div>
                  <div className="text-[14px] font-bold text-red-400">{result.stats?.critical ?? 0}</div>
                </div>
              </div>
              <div className="bg-card rounded-xl shadow-sm border border-zinc-800/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center text-lg font-bold">
                  {result.stats?.warnings ?? 0}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Cảnh báo</div>
                  <div className="text-[14px] font-bold text-orange-400">{result.stats?.warnings ?? 0}</div>
                </div>
              </div>
              <div className="bg-card rounded-xl shadow-sm border border-zinc-800/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center text-lg font-bold">
                  {result.stats?.optimizations ?? 0}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Tối ưu</div>
                  <div className="text-[14px] font-bold text-green-400">{result.stats?.optimizations ?? 0}</div>
                </div>
              </div>
            </div>

            {/* 3-panel: tree | code | summary+issues */}
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_340px] gap-5">
              {/* Panel 1: File tree */}
              <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden lg:h-[calc(100vh-280px)] lg:sticky lg:top-4 flex flex-col">
                <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-800/40 flex items-center gap-2">
                  <span className="text-sm">🗜️</span>
                  <span className="text-[13px] font-bold text-zinc-200">Files</span>
                  <span className="ml-auto text-[11px] text-zinc-500">{fileCount} file</span>
                </div>
                <div className="p-2 overflow-y-auto flex-1">
                  {members.length === 0 && <p className="text-zinc-500 text-[13px] p-3">Không có file</p>}
                  <FileTree members={members} selected={selectedFile} onSelect={loadFile} />
                </div>
              </div>

              {/* Panel 2: Code preview */}
              <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden lg:h-[calc(100vh-280px)] lg:sticky lg:top-4 flex flex-col">
                <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-800/40 flex items-center gap-2">
                  <span className="text-[13px] font-bold text-zinc-200">
                    {selectedFile ? `📄 ${selectedFile}` : "Code Preview"}
                  </span>
                </div>
                {loadingFile ? (
                  <div className="flex-1 flex items-center justify-center text-zinc-500 text-[14px]">Đang tải...</div>
                ) : fileContent ? (
                  <CodePreview
                    content={fileContent.text}
                    path={fileContent.path}
                    issues={issues}
                    activeIssue={activeIssue}
                    onPickIssue={pickIssue}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
                    <span className="text-4xl mb-3">👈</span>
                    <p className="text-[14px]">Chọn file bên trái để xem mã nguồn</p>
                  </div>
                )}
              </div>

              {/* Panel 3: Summary + Issues */}
              <div className="flex flex-col gap-5 lg:h-[calc(100vh-280px)] lg:overflow-y-auto pr-1">
                <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 p-5">
                  <h3 className="text-[14px] font-bold text-zinc-200 mb-2">📝 Tóm tắt</h3>
                  <p className="text-[13px] text-zinc-400 leading-relaxed">
                    {result.backendData?.summary || "Không có tóm tắt."}
                  </p>
                  {result.backendData?.model && (
                    <p className="text-[11px] text-zinc-500 mt-3">
                      Model: {result.backendData.provider} / {result.backendData.model}
                    </p>
                  )}
                </div>

                <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-800/40 flex items-center gap-2">
                    <span className="text-[13px] font-bold text-zinc-200">Vấn đề ({issues.length})</span>
                  </div>
                  <div className="p-2 flex gap-1.5 flex-wrap border-b border-zinc-800/60">
                    {(["all", "critical", "warning", "optimization"] as const).map((f) => {
                      const count =
                        f === "all" ? issues.length
                        : f === "critical" ? (result.stats?.critical ?? 0)
                        : f === "warning" ? (result.stats?.warnings ?? 0)
                        : (result.stats?.optimizations ?? 0);
                      const label = f === "all" ? "Tất cả" : f === "critical" ? "Lỗi" : f === "warning" ? "Cảnh báo" : "Tối ưu";
                      return (
                        <button
                          key={f}
                          onClick={() => setFilter(f)}
                          className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                            filter === f ? "bg-primary text-primary-foreground" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                          }`}
                        >
                          {label} ({count})
                        </button>
                      );
                    })}
                  </div>
                  <div className="divide-y divide-zinc-800/60 max-h-[480px] overflow-y-auto">
                    {filteredIssues.length === 0 && (
                      <div className="p-6 text-center text-zinc-500 text-[13px]">Không có vấn đề trong bộ lọc này.</div>
                    )}
                    {filteredIssues.map((issue, idx) => {
                      const cfg = severityLabel(issue.severity);
                      const active = activeIssue === issue;
                      return (
                        <button
                          key={idx}
                          onClick={() => pickIssue(issue)}
                          className={`w-full text-left p-4 hover:bg-zinc-800/40 transition-colors ${active ? "bg-teal-500/5" : ""}`}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${cfg.bg} ${cfg.txt}`}>
                              {cfg.label}
                            </span>
                            <span className="text-[11px] text-zinc-500 font-mono truncate">
                              {issue.file}:{issue.line}
                            </span>
                          </div>
                          <p className="text-[13px] font-semibold text-zinc-200 mb-1">{issue.type}</p>
                          <p className="text-[12px] text-zinc-400 leading-relaxed">{issue.description}</p>
                          {issue.suggestion && (
                            <p className="text-[12px] text-teal-400 mt-1.5 italic">💡 {issue.suggestion}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
