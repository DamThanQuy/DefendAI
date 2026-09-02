"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CodePreview } from "@/components/features/code-review/CodePreview";
import { FileTree } from "@/components/features/assessment/FileTree";
import type { CodeIssue } from "@/types";
import { Maximize2, Minimize2 } from "lucide-react";

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
  backendData: { summary: string; provider?: string; model?: string; total_modules?: number; done_modules?: number; module_progress?: { done: number; total: number } };
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
  const [loadingTree, setLoadingTree] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<{ path: string; text: string } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [activeIssue, setActiveIssue] = useState<CodeIssue | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [issueQuery, setIssueQuery] = useState("");
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set());
  const [fileIssueFilter, setFileIssueFilter] = useState<string | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<null | "issues">(null);
  const [moduleProgress, setModuleProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const token = useMemo(
    () => (typeof window !== "undefined" ? localStorage.getItem("access_token") : null),
    []
  );

  const issues = result?.details ?? [];
  const fileCount = useMemo(() => members.filter((m) => !m.is_dir).length, [members]);

  // Số issue (và số critical) theo file — dùng cho badge trên FileTree
  const fileIssueStats = useMemo(() => {
    const m = new Map<string, { count: number; critical: number }>();
    for (const i of issues) {
      const cur = m.get(i.file) ?? { count: 0, critical: 0 };
      cur.count += 1;
      const s = i.severity?.toLowerCase();
      if (s === "critical" || s === "high") cur.critical += 1;
      m.set(i.file, cur);
    }
    return m;
  }, [issues]);

  // Lấy nội dung 1 file để preview
  const loadFile = (path: string, docIdOverride?: number, filterIssues = false) => {
    setSelectedFile(path);
    setActiveIssue(null);
    if (filterIssues && fileIssueStats.get(path)?.count) viewAllFileIssues(path);
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
    setStatus(selectedDoc ? "scanning" : "uploading");
    setErrorMsg("");
    setResult(null);
    setMembers([]);
    setLoadingTree(false);
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
    setModuleProgress(data.backendData?.module_progress ?? { done: 0, total: 0 });
    const docId = data.documentId;
    if (docId && token) {
      setLoadingTree(true);
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
        .catch(() => {})
        .finally(() => setLoadingTree(false));
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

  // Đóng overlay full-screen bằng Esc
  useEffect(() => {
    if (!expandedPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedPanel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedPanel]);

  const filteredIssues = issues.filter((i) => {
    const s = i.severity?.toLowerCase();
    if (filter === "high") return s === "critical" || s === "high";
    if (filter === "medium") return s === "medium" || s === "warn" || s === "warning";
    if (filter === "low") return s === "low" || s === "info" || s === "optimization";
    return true;
  }).filter((i) => {
    const q = issueQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (i.type || "").toLowerCase().includes(q) ||
      (i.file || "").toLowerCase().includes(q) ||
      (i.description || "").toLowerCase().includes(q)
    );
  }).filter((i) => (fileIssueFilter ? i.file === fileIssueFilter : true));

  const toggleIssue = (id: number) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Xem toàn bộ issue của file đang mở: lọc theo file + mở rộng hết + auto-scroll
  const viewAllFileIssues = (file: string) => {
    setFileIssueFilter(file);
    setFilter("all");
    setExpandedIssues(new Set(issues.filter((i) => i.file === file).map((i) => i.id)));
    requestAnimationFrame(() => {
      document.querySelector('[data-issues-scroll]')?.scrollTo({ top: 0 });
    });
  };

  const severityLabel = (s: string) => {
    const low = s?.toLowerCase() || "low";
    if (low === "critical" || low === "high") return { label: "CRITICAL", bg: "bg-red-500/10", txt: "text-red-400" };
    if (low === "medium") return { label: "WARNING", bg: "bg-orange-500/10", txt: "text-orange-400" };
    return { label: "OPTIMIZATION", bg: "bg-green-500/10", txt: "text-green-400" };
  };

  const renderIssuesCard = (full: boolean) => (
    <div className={`bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden flex flex-col ${full ? "h-full" : ""}`}>
      <div className="px-4 py-3 border-b border-border/60 bg-muted/40 flex items-center gap-2">
        <span className="text-[13px] font-bold text-foreground">Vấn đề ({issues.length})</span>
        <button
          onClick={() => setExpandedPanel(full ? null : "issues")}
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={full ? "Thu nhỏ" : "Toàn màn hình"}
        >
          {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
      <div className="p-2 flex flex-col gap-1.5 border-b border-border/60">
        <div className="flex gap-1.5 flex-wrap">
          {(() => {
            const counts = {
              high: issues.filter((i) => {
                const s = i.severity?.toLowerCase();
                return s === "critical" || s === "high";
              }).length,
              medium: issues.filter((i) => {
                const s = i.severity?.toLowerCase();
                return s === "medium" || s === "warn" || s === "warning";
              }).length,
              low: issues.filter((i) => {
                const s = i.severity?.toLowerCase();
                return s === "low" || s === "info" || s === "optimization";
              }).length,
            };
            const tabs: { f: "all" | "high" | "medium" | "low"; label: string; count: number }[] = [
              { f: "all", label: "Tất cả", count: issues.length },
              { f: "high", label: "High", count: counts.high },
              { f: "medium", label: "Medium", count: counts.medium },
              { f: "low", label: "Low", count: counts.low },
            ];
            return tabs.map(({ f, label, count }) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted"
                }`}
              >
                {label} ({count})
              </button>
            ));
          })()}
        </div>
        <div className="flex gap-1.5">
          <input
            value={issueQuery}
            onChange={(e) => setIssueQuery(e.target.value)}
            placeholder="🔍 Tìm theo type, file hoặc mô tả..."
            className="flex-1 min-w-0 px-3 py-1.5 bg-card border border-border rounded-lg text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {selectedFile && fileIssueStats.get(selectedFile)?.count ? (
            fileIssueFilter === selectedFile ? (
              <button
                onClick={() => { setFileIssueFilter(null); setExpandedIssues(new Set()); }}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-foreground bg-muted rounded-lg hover:bg-muted shrink-0"
              >
                ✕ Bỏ lọc
              </button>
            ) : (
              <button
                onClick={() => viewAllFileIssues(selectedFile)}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 shrink-0"
              >
                👁 Xem hết ({fileIssueStats.get(selectedFile)?.count})
              </button>
            )
          ) : null}
        </div>
      </div>
      <div data-issues-scroll className={`divide-y divide-border/60 overflow-y-auto custom-scrollbar ${full ? "flex-1" : "max-h-[480px]"}`}>
        {filteredIssues.length === 0 && (
          <div className="p-6 text-center text-muted-foreground text-[13px]">Không có vấn đề trong bộ lọc này.</div>
        )}
        {filteredIssues.map((issue) => {
          const cfg = severityLabel(issue.severity);
          const active = activeIssue === issue;
          const open = expandedIssues.has(issue.id);
          return (
            <div
              key={issue.id}
              className={`${active ? "bg-teal-500/5" : ""}`}
            >
              <button
                onClick={() => toggleIssue(issue.id)}
                className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors flex items-center gap-2"
              >
                <span className={`text-[9px] text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase shrink-0 ${cfg.bg} ${cfg.txt}`}>
                  {cfg.label}
                </span>
                <span className="text-[12px] font-semibold text-foreground truncate flex-1">{issue.type}</span>
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[45%] shrink-0">
                  {issue.file.split("/").pop()}:{issue.line}
                </span>
              </button>
              {open && (
                <div className="px-5 pb-3">
                  <p className="text-[12px] text-muted-foreground leading-relaxed">{issue.description}</p>
                  {issue.suggestion && (
                    <p className="text-[12px] text-teal-400 mt-1.5 italic">💡 {issue.suggestion}</p>
                  )}
                  <button
                    onClick={() => pickIssue(issue)}
                    className="mt-2 px-2.5 py-1 text-[11px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                  >
                    👁 Xem trong code
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-8 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
          <div>
            <h1 className="text-[22px] font-bold text-foreground mb-2">Code Review AI</h1>
            <p className="text-muted-foreground text-[15px]">
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
              className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold text-[14px] rounded-lg hover:bg-muted transition-colors shadow-sm disabled:opacity-50"
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
              className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border text-foreground font-semibold text-[14px] rounded-lg hover:bg-muted transition-colors shadow-sm"
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
              className="bg-card rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[80vh] border border-border/60"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
                <h3 className="text-[15px] font-bold text-foreground">🗂️ Chọn file ZIP/RAR đã tải lên</h3>
                <button
                  onClick={() => setShowDocPicker(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {uploadedDocs.length === 0 && (
                  <p className="text-muted-foreground text-[13px] p-4">Chưa có file ZIP/RAR nào được tải lên.</p>
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
                    <span className="flex-1 text-[13px] font-semibold text-foreground truncate">{d.filename}</span>
                    <span className="text-[11px] text-muted-foreground">
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
          <div className="bg-card rounded-2xl border-2 border-dashed border-border p-16 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-bold text-foreground mb-2">Chọn file ZIP/RAR chứa source code</h2>
            <p className="text-muted-foreground text-[14px] max-w-md mx-auto">
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
            <div className="w-10 h-10 border-[3px] border-border border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">
              {status === "uploading" ? "Đang tải file lên..." : "Đang phân tích mã nguồn..."}
            </p>
            {status === "scanning" && moduleProgress.total > 0 && (
              <div className="mt-4 max-w-md mx-auto">
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(moduleProgress.done / moduleProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-[12px] mt-1.5">
                  Module {moduleProgress.done}/{moduleProgress.total}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Done: 3-panel review */}
        {status === "done" && result && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-card rounded-xl shadow-sm border border-border/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center text-lg font-bold">
                  {result.stats?.critical ?? 0}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Lỗi nghiêm trọng</div>
                  <div className="text-[14px] font-bold text-red-400">{result.stats?.critical ?? 0}</div>
                </div>
              </div>
              <div className="bg-card rounded-xl shadow-sm border border-border/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-orange-500/10 text-orange-400 flex items-center justify-center text-lg font-bold">
                  {result.stats?.warnings ?? 0}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Cảnh báo</div>
                  <div className="text-[14px] font-bold text-orange-400">{result.stats?.warnings ?? 0}</div>
                </div>
              </div>
              <div className="bg-card rounded-xl shadow-sm border border-border/60 p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center text-lg font-bold">
                  {result.stats?.optimizations ?? 0}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Tối ưu</div>
                  <div className="text-[14px] font-bold text-green-400">{result.stats?.optimizations ?? 0}</div>
                </div>
              </div>
            </div>

            {/* Module progress (show if modules were processed) */}
            {moduleProgress.total > 0 && (
              <div className="bg-card rounded-xl border border-border/60 p-3 mb-4 flex items-center gap-3">
                <span className="text-[12px] text-muted-foreground">Đã xử lý</span>
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full"
                    style={{ width: `${(moduleProgress.done / moduleProgress.total) * 100}%` }}
                  />
                </div>
                <span className="text-[12px] text-muted-foreground">{moduleProgress.done}/{moduleProgress.total} modules</span>
              </div>
            )}

            {/* 3-panel: tree | code | summary+issues */}
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_340px] gap-5">
              {/* Panel 1: File tree */}
              <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden lg:h-[calc(100vh-280px)] lg:sticky lg:top-4 flex flex-col">
                <div className="px-4 py-3 border-b border-border/60 bg-muted/40 flex items-center gap-2">
                  <span className="text-sm">🗜️</span>
                  <span className="text-[13px] font-bold text-foreground">Files</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">{fileCount} file</span>
                </div>
                <div className="p-2 overflow-y-auto flex-1 custom-scrollbar">
                  {loadingTree ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                      <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
                      <p className="text-[12px]">Đang tải cây thư mục...</p>
                    </div>
                  ) : members.length === 0 ? (
                    <p className="text-muted-foreground text-[13px] p-3">Không có file</p>
                  ) : (
                    <FileTree members={members} selected={selectedFile} onSelect={(p) => loadFile(p, undefined, true)} fileStats={fileIssueStats} />
                  )}
                </div>
              </div>

              {/* Panel 2: Code preview */}
              <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden lg:h-[calc(100vh-280px)] lg:sticky lg:top-4 flex flex-col">
                <div className="px-4 py-3 border-b border-border/60 bg-muted/40 flex items-center gap-2">
                  <span className="text-[13px] font-bold text-foreground">
                    {selectedFile ? `📄 ${selectedFile}` : "Code Preview"}
                  </span>
                </div>
                {loadingFile ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-[14px]">Đang tải...</div>
                ) : fileContent ? (
                  <CodePreview
                    content={fileContent.text}
                    path={fileContent.path}
                    issues={issues}
                    activeIssue={activeIssue}
                    onPickIssue={pickIssue}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                    <span className="text-4xl mb-3">👈</span>
                    <p className="text-[14px]">Chọn file bên trái để xem mã nguồn</p>
                  </div>
                )}
              </div>

              {/* Panel 3: Summary + Issues */}
              <div className="flex flex-col gap-5 lg:h-[calc(100vh-280px)] lg:overflow-y-auto pr-1">
                <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5">
                  <h3 className="text-[14px] font-bold text-foreground mb-2">📝 Tóm tắt</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    {result.backendData?.summary || "Không có tóm tắt."}
                  </p>
                  {result.backendData?.model && (
                    <p className="text-[11px] text-muted-foreground mt-3">
                      Model: {result.backendData.provider} / {result.backendData.model}
                    </p>
                  )}
                </div>

                {renderIssuesCard(false)}
              </div>
            </div>
          </>
        )}

        {/* Overlay: panel Vấn đề full-screen */}
        {expandedPanel === "issues" && (
          <div className="fixed inset-0 z-[60] bg-black/80 p-4 md:p-8 flex" onClick={() => setExpandedPanel(null)}>
            <div
              className="w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {renderIssuesCard(true)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
