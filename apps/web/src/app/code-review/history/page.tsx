"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AnalysisItem {
  analysis_id: number;
  document_id: number;
  document_name: string | null;
  status: string;
  pass_rate: number | null;
  total_files: number | null;
  stats: { critical?: number; high?: number; medium?: number; low?: number; info?: number } | null;
  provider: string | null;
  model: string | null;
  created_at: string | null;
}

export default function CodeReviewHistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;
    fetch("/api/code/analyses", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAnalyses(d.analyses ?? []))
      .catch((e) => setError(e?.message || "Không thể tải lịch sử"))
      .finally(() => setLoading(false));
  }, []);

  const statsOf = (a: AnalysisItem) => {
    const s = a.stats || {};
    const critical = (s.critical || 0) + (s.high || 0);
    const warnings = s.medium || 0;
    const optimizations = (s.low || 0) + (s.info || 0);
    return { critical, warnings, optimizations };
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.toLocaleDateString("vi-VN")} ${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-8 max-w-[1200px]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-zinc-200 mb-1">🕘 Lịch sử Code Review</h1>
            <p className="text-zinc-500 text-[14px]">Các lần phân tích mã nguồn đã chạy, mới nhất trước.</p>
          </div>
          <Link
            href="/code-review"
            className="px-4 py-2 bg-primary text-primary-foreground font-semibold text-[13px] rounded-lg hover:bg-primary/90 transition-colors"
          >
            🔍 Code Review mới
          </Link>
        </div>

        {loading && <p className="text-zinc-500 text-[14px]">Đang tải lịch sử...</p>}
        {error && <p className="text-red-400 text-[14px]">{error}</p>}

        {!loading && !error && analyses.length === 0 && (
          <div className="bg-card rounded-2xl border-2 border-dashed border-zinc-700 p-12 text-center">
            <div className="text-4xl mb-3">🗜️</div>
            <p className="text-zinc-400 font-medium mb-2">Chưa có lần code review nào.</p>
            <p className="text-zinc-500 text-[13px] mb-5">Chạy phân tích đầu tiên để xem kết quả tại đây.</p>
            <Link
              href="/code-review"
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-lg hover:bg-primary/90 transition-colors"
            >
              🔍 Chạy Code Review
            </Link>
          </div>
        )}

        {analyses.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {analyses.map((a) => {
              const s = statsOf(a);
              const score = a.pass_rate ?? 0;
              const statusBadge =
                a.status === "completed"
                  ? "bg-teal-500/10 text-teal-400"
                  : a.status === "failed"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-orange-500/10 text-orange-400";
              return (
                <Link
                  key={a.analysis_id}
                  href={`/code-review?analysis=${a.analysis_id}`}
                  className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 p-5 hover:border-teal-500/40 hover:bg-zinc-800/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-bold text-zinc-200 truncate">{a.document_name || `Document #${a.document_id}`}</p>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-500 bg-zinc-800 rounded shrink-0">ID {a.analysis_id}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{formatDate(a.created_at)}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase shrink-0 ${statusBadge}`}>
                      {a.status}
                    </span>
                  </div>

                  {a.status === "completed" && (
                    <>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center text-lg font-bold">
                          {score}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          <div>{a.total_files ?? 0} file</div>
                          <div>{s.critical + s.warnings + s.optimizations} vấn đề</div>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {([["critical", "Lỗi"], ["warnings", "Cảnh báo"], ["optimizations", "Tối ưu"]] as const).map(([k, label]) => {
                          const n = s[k];
                          const cfg =
                            k === "critical"
                              ? { bg: "bg-red-500/10", txt: "text-red-400" }
                              : k === "warnings"
                                ? { bg: "bg-orange-500/10", txt: "text-orange-400" }
                                : { bg: "bg-green-500/10", txt: "text-green-400" };
                          return (
                            <span key={k} className={`px-2 py-0.5 text-[10px] font-bold rounded ${cfg.bg} ${cfg.txt}`}>
                              {label} {n}
                            </span>
                          );
                        })}
                      </div>
                      {a.model && <p className="text-[10px] text-zinc-600 mt-3 truncate">Model: {a.model}</p>}
                    </>
                  )}
                  {a.status !== "completed" && (
                    <p className="text-[12px] text-zinc-500">Không hiển thị được kết quả.</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}