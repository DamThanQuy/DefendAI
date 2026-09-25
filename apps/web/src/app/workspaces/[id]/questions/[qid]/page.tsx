"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
interface Question {
  id: number;
  question: string;
  hint?: string;
  suggested_answer?: string;
  difficulty: string;
  citations?: string[];
}

interface WorkspaceSourceItem {
  num: number;
  source: string;
  title: string;
  chunk_index?: number;
  content?: string;
}

interface WorkspaceQuestionDetail {
  id: number;
  workspace_id: number;
  topic: string;
  status: string;
  questions: Question[] | null;
  sources?: WorkspaceSourceItem[] | null;
  error: string | null;
  created_at: string;
}

const diffCfg: Record<string, { label: string; bg: string; txt: string }> = {
  easy: { label: "Dễ", bg: "bg-green-500/10", txt: "text-green-400" },
  medium: { label: "Trung bình", bg: "bg-blue-500/10", txt: "text-blue-400" },
  hard: { label: "Khó", bg: "bg-red-500/10", txt: "text-red-400" },
};

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

function renderWithRefs(text: string) {
  if (!text) return text;
  return text.split(/(\[\d+\])/g).map((p, i) => {
    const m = p.match(/^\[(\d+)\]$/);
    if (m) {
      return (
        <sup
          key={i}
          className="ml-0.5 inline-flex items-center justify-center w-[17px] h-[17px] rounded-full bg-teal-500/15 text-teal-300 text-[10px] font-bold leading-none"
        >
          {m[1]}
        </sup>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export default function WqDetailPage() {
  const params = useParams();
  const wsId = Number(params.id);
  const qid = Number(params.qid);

  const [data, setData] = useState<WorkspaceQuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!wsId || !qid) return;
    const token = getToken();
    if (!token) return;
    setLoading(true);
    fetch(`/api/workspaces/${wsId}/questions/${qid}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Không tìm thấy phiên này");
        return r.json();
      })
      .then((d: WorkspaceQuestionDetail) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [wsId, qid]);

  const formatDate = (iso: string) =>
    // backend returns naive UTC; treat as UTC then localize to viewer TZ
    new Date(iso + "Z").toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  const difficulty = (d: string) => diffCfg[d] ?? diffCfg.medium;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">Không thể tải phiên</h2>
          <p className="text-muted-foreground mb-4">{error || "Phiên không tồn tại."}</p>
          <Link href={`/workspaces/${wsId}`} className="text-primary font-semibold hover:underline">← Quay lại workspace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[900px]">
        {/* Breadcrumbs (AppShell đã có Trang chủ › Workspace, chỉ thêm phần detail) */}
        <div className="flex items-center text-[13px] text-muted-foreground font-medium mb-4 flex-wrap">
          <Link href={`/workspaces/${wsId}`} className="hover:text-primary transition-colors">Workspace #{wsId}</Link>
          <span className="mx-2">›</span>
          <Link href={`/workspaces/${wsId}`} className="hover:text-primary transition-colors">🎓 Luyện phản biện</Link>
          <span className="mx-2">›</span>
          <span className="text-primary font-semibold">Phiên #{data.id}</span>
        </div>

        {/* Header */}
        <div className="bg-card rounded-2xl shadow-sm border border-border/60 p-5 mb-5">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[14px] font-bold text-foreground">🎓 Phiên luyện phản biện #{data.id}</span>
            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
              data.status === "completed" ? "bg-green-500/10 text-green-400"
              : data.status === "failed" ? "bg-red-500/10 text-red-400"
              : "bg-blue-500/10 text-blue-400"
            }`}>{data.status}</span>
          </div>
          <p className="text-[12px] text-muted-foreground">{formatDate(data.created_at)}</p>
        </div>

        {data.status === "failed" ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-red-400 text-[14px]">
            {data.error || "Tạo câu hỏi thất bại."}
          </div>
        ) : !data.questions || data.questions.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border/60 p-8 text-center text-muted-foreground text-[14px]">
            Chưa có câu hỏi.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.questions.map((q) => {
              const d = difficulty(q.difficulty);
              const answer = q.suggested_answer || q.hint || "";
              return (
                <div key={q.id} className="bg-card border border-border/60 rounded-2xl p-5">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`px-2.5 py-1 ${d.bg} ${d.txt} text-[11px] font-bold rounded-full`}>{d.label}</span>
                    <span className="text-[11px] text-muted-foreground font-medium">#{q.id}</span>
                  </div>
                  <h4 className="text-[15px] font-bold text-teal-400 leading-snug">{renderWithRefs(q.question)}</h4>
                  {answer && (
                    <details className="mt-3 group">
                      <summary className="cursor-pointer select-none text-[13px] font-semibold text-foreground hover:text-primary transition-colors">
                        💡 Gợi ý câu trả lời
                      </summary>
                      <div className="mt-2 pl-3 border-l-2 border-border text-muted-foreground text-[13px] leading-relaxed whitespace-pre-wrap">
                        {answer}
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {data.sources && data.sources.length > 0 && (
          <details className="mt-5 bg-card border border-border/60 rounded-2xl">
            <summary className="cursor-pointer px-5 py-3 text-[13px] font-bold text-foreground select-none">📚 Nguồn tham khảo ({data.sources.length})</summary>
            <div className="px-5 pb-5 flex flex-col gap-2">
              {data.sources.map((s) => (
                <div key={s.num} className="text-[13px]">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-[17px] h-[17px] rounded-full bg-muted text-foreground text-[10px] font-bold leading-none shrink-0 mt-0.5">{s.num}</span>
                    <div>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${s.source === "ref" ? "bg-purple-500/15 text-purple-300" : "bg-muted text-muted-foreground"}`}>{s.source === "ref" ? "REF" : "USER"}</span>
                      <span className="ml-2 font-semibold text-foreground">{s.title}</span>
                      {typeof s.chunk_index === "number" && <span className="text-muted-foreground"> — đoạn {s.chunk_index}</span>}
                    </div>
                  </div>
                  {s.content && <p className="pl-[25px] text-muted-foreground leading-relaxed mt-1">{s.content}</p>}
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="mt-6">
          <Link
            href={`/workspaces/${wsId}`}
            className="px-4 py-2 text-[13px] font-semibold text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted transition-colors"
          >
            ← Quay lại workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
