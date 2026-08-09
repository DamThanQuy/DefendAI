"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PERSONA_LABELS } from "@/lib/constants";

interface Question {
  id: number;
  question: string;
  hint: string;
  difficulty: string;
  persona: string;
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
  persona: string;
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
    new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  const difficulty = (d: string) => diffCfg[d] ?? diffCfg.medium;
  const personaLabel = (p: string) => PERSONA_LABELS[p] ?? p;

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
          <p className="text-zinc-500 mb-4">{error || "Phiên không tồn tại."}</p>
          <Link href={`/workspaces/${wsId}`} className="text-primary font-semibold hover:underline">← Quay lại workspace</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[900px]">
        {/* Breadcrumbs (AppShell đã có Trang chủ › Workspace, chỉ thêm phần detail) */}
        <div className="flex items-center text-[13px] text-zinc-500 font-medium mb-4 flex-wrap">
          <Link href={`/workspaces/${wsId}`} className="hover:text-primary transition-colors">Workspace #{wsId}</Link>
          <span className="mx-2">›</span>
          <Link href={`/workspaces/${wsId}`} className="hover:text-primary transition-colors">🎓 Luyện phản biện</Link>
          <span className="mx-2">›</span>
          <span className="text-primary font-semibold">Phiên #{data.id}</span>
        </div>

        {/* Header */}
        <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 p-5 mb-5">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[14px] font-bold text-zinc-200">🎓 Phiên luyện phản biện #{data.id}</span>
            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
              data.persona === "theory" ? "bg-green-500/10 text-green-400"
              : data.persona === "strict" ? "bg-red-500/10 text-red-400"
              : "bg-purple-500/10 text-purple-300"
            }`}>{personaLabel(data.persona)}</span>
            <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
              data.status === "completed" ? "bg-green-500/10 text-green-400"
              : data.status === "failed" ? "bg-red-500/10 text-red-400"
              : "bg-blue-500/10 text-blue-400"
            }`}>{data.status}</span>
          </div>
          <p className="text-[12px] text-zinc-500">{formatDate(data.created_at)}</p>
        </div>

        {data.status === "failed" ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-red-400 text-[14px]">
            {data.error || "Tạo câu hỏi thất bại."}
          </div>
        ) : !data.questions || data.questions.length === 0 ? (
          <div className="bg-card rounded-2xl border border-zinc-800/60 p-8 text-center text-zinc-500 text-[14px]">
            Chưa có câu hỏi.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.questions.map((q) => {
              const d = difficulty(q.difficulty);
              return (
                <div key={q.id} className="bg-card border border-zinc-800/60 rounded-2xl p-5">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`px-2.5 py-1 ${d.bg} ${d.txt} text-[11px] font-bold rounded-full`}>{d.label}</span>
                    <span className="text-[11px] text-zinc-500 font-medium">#{q.id}</span>
                  </div>
                  <h4 className="text-[15px] font-bold text-teal-400 leading-snug">{renderWithRefs(q.question)}</h4>
                  {q.hint && <p className="mt-2 text-zinc-500 text-[13px] italic">💡 {q.hint}</p>}
                </div>
              );
            })}
          </div>
        )}

        {data.sources && data.sources.length > 0 && (
          <details className="mt-5 bg-card border border-zinc-800/60 rounded-2xl">
            <summary className="cursor-pointer px-5 py-3 text-[13px] font-bold text-zinc-300 select-none">📚 Nguồn tham khảo ({data.sources.length})</summary>
            <div className="px-5 pb-5 flex flex-col gap-2">
              {data.sources.map((s) => (
                <div key={s.num} className="text-[13px]">
                  <div className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-[17px] h-[17px] rounded-full bg-zinc-700 text-zinc-200 text-[10px] font-bold leading-none shrink-0 mt-0.5">{s.num}</span>
                    <div>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${s.source === "ref" ? "bg-purple-500/15 text-purple-300" : "bg-zinc-800 text-zinc-400"}`}>{s.source === "ref" ? "REF" : "USER"}</span>
                      <span className="ml-2 font-semibold text-zinc-300">{s.title}</span>
                      {typeof s.chunk_index === "number" && <span className="text-zinc-500"> — đoạn {s.chunk_index}</span>}
                    </div>
                  </div>
                  {s.content && <p className="pl-[25px] text-zinc-500 leading-relaxed mt-1">{s.content}</p>}
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="mt-6">
          <Link
            href={`/workspaces/${wsId}`}
            className="px-4 py-2 text-[13px] font-semibold text-zinc-400 bg-card border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            ← Quay lại workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
