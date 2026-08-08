"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { PERSONA_LABELS, PERSONAS } from "@/lib/constants";
import { FileTree } from "@/components/features/assessment/FileTree";
import { FilePreview } from "@/components/features/assessment/FilePreview";
import WorkspaceChat from "@/components/features/workspace/WorkspaceChat";

interface WorkspaceFile {
  document_id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  role: string;
  added_at: string;
}

interface Workspace {
  id: number;
  name: string;
  created_at: string;
  document_count: number;
  files: WorkspaceFile[];
}

interface Member {
  path: string;
  size: number;
  is_dir: boolean;
}

interface Question {
  id: number;
  question: string;
  hint: string;
  difficulty: string;
  persona: string;
  citations?: string[];
}

interface SessionItem {
  id: number;
  document_id: number;
  document_name: string;
  persona?: string;
  status: string;
  pass_rate?: number | null;
  issue_count?: number | null;
  created_at: string;
}

interface SessionsResponse {
  assessments: SessionItem[];
  code_analyses: SessionItem[];
}

interface WorkspaceSourceItem {
  num: number;
  source: string; // "user" | "ref"
  title: string;
  chunk_index?: number;
  content?: string;
}

interface WorkspaceQuestionItem {
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

const docTypeLabel: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  zip: "ZIP",
  rar: "RAR",
};

const diffCfg: Record<string, { label: string; bg: string; txt: string }> = {
  easy: { label: "Dễ", bg: "bg-green-500/10", txt: "text-green-400" },
  medium: { label: "Trung bình", bg: "bg-blue-500/10", txt: "text-blue-400" },
  hard: { label: "Khó", bg: "bg-red-500/10", txt: "text-red-400" },
};

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

/** Preview 1 document không phải zip (PDF/ảnh/text/MD) qua endpoint download. */
function DocPreview({ docId, filename }: { docId: number; filename: string }) {
  const [content, setContent] = useState<{ text: string; type: "binary" | "text" } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent(null);
    setError("");
    const token = getToken();
    fetch(`/api/documents/${docId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Không thể đọc file");
        const lower = filename.toLowerCase();
        if (/\.(pdf|png|jpg|jpeg|gif|svg|webp|bmp|ico|docx|pptx|xlsx)$/.test(lower)) {
          const blob = await res.blob();
          return { text: URL.createObjectURL(blob), type: "binary" as const };
        }
        return { text: await res.text(), type: "text" as const };
      })
      .then((c) => { if (!cancelled) setContent(c); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [docId, filename]);

  if (loading) return <div className="h-full flex items-center justify-center text-zinc-500 text-[14px]">Đang tải nội dung...</div>;
  if (error) return <div className="p-6 text-red-400 text-[14px]">{error}</div>;
  if (!content) return null;

  const isMd = filename.toLowerCase().endsWith(".md");

  if (content.type === "binary") {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-900 overflow-auto">
        {filename.toLowerCase().endsWith(".pdf") ? (
          <iframe src={content.text} className="w-full h-full" title={filename} />
        ) : (
          <img src={content.text} alt={filename} className="max-w-full max-h-full object-contain" />
        )}
      </div>
    );
  }

  if (isMd) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <article className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed">
          <ReactMarkdown>{content.text}</ReactMarkdown>
        </article>
      </div>
    );
  }

  return (
    <pre className="flex-1 overflow-auto p-4 text-[13px] leading-relaxed font-mono text-zinc-300 whitespace-pre">
      {content.text}
    </pre>
  );
}

// Render text kèm tham chiếu dạng [N] thành badge số tròn kiểu ChatGPT/DeepSeek
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

export default function WorkspaceDetailPage() {
  const params = useParams();
  const wsId = Number(params.id);

  const [ws, setWs] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sidebar selection
  const [selDocId, setSelDocId] = useState<number | null>(null);
  const [selMember, setSelMember] = useState<string | null>(null);
  const [zipMembers, setZipMembers] = useState<Record<number, Member[]>>({});
  const [zipExpanded, setZipExpanded] = useState<Set<number>>(new Set());

  // Right tabs
  const [rightTab, setRightTab] = useState<"preview" | "questions" | "history" | "chat">("preview");

  // "Hỏi theo đề tài" (R6 — toàn workspace)
  const [topic, setTopic] = useState("");
  const [wsPersona, setWsPersona] = useState("theory");
  const [wsQuestions, setWsQuestions] = useState<WorkspaceQuestionItem[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsQError, setWsQError] = useState("");
  const [wsRunning, setWsRunning] = useState(false);

  // History
  const [sessions, setSessions] = useState<SessionsResponse | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    if (!wsId) return;
    const token = getToken();
    if (!token) return;
    fetch(`/api/workspaces/${wsId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error("Không thể tải workspace");
        return r.json();
      })
      .then((data: Workspace) => {
        setWs(data);
        if (data.files.length > 0) {
          const first = data.files[0];
          setSelDocId(first.document_id);
          if (first.doc_type === "zip" || first.doc_type === "rar") {
            setRightTab("preview");
            openZip(first.document_id);
          }
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  const openZip = async (docId: number) => {
    const token = getToken();
    if (!token) return;
    if (zipMembers[docId]) {
      setZipExpanded((prev) => new Set(prev).add(docId));
      return;
    }
    try {
      const r = await fetch(`/api/documents/${docId}/contents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setZipMembers((prev) => ({ ...prev, [docId]: data.items ?? [] }));
        setZipExpanded((prev) => new Set(prev).add(docId));
      }
    } catch { /* ignore */ }
  };

  const selectFile = (f: WorkspaceFile) => {
    setSelDocId(f.document_id);
    setSelMember(null);
    setRightTab("preview");
    if (f.doc_type === "zip" || f.doc_type === "rar") openZip(f.document_id);
  };

  const openTab = (tab: "preview" | "questions" | "history" | "chat") => {
    setRightTab(tab);
    if (tab === "questions" && wsQuestions.length === 0 && !wsLoading) loadWorkspaceQuestions();
    if (tab === "history" && !sessions && !loadingSessions) loadSessions();
  };

  const loadSessions = async () => {
    const token = getToken();
    if (!token) return;
    setLoadingSessions(true);
    try {
      const r = await fetch(`/api/workspaces/${wsId}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setSessions({ assessments: data.assessments ?? [], code_analyses: data.code_analyses ?? [] });
      }
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadWorkspaceQuestions = async () => {
    const token = getToken();
    if (!token) return;
    setWsLoading(true);
    setWsQError("");
    try {
      const r = await fetch(`/api/workspaces/${wsId}/questions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Không thể tải lịch sử đề tài");
      const data = await r.json();
      setWsQuestions(data ?? []);
    } catch (e: any) {
      setWsQError(e.message);
    } finally {
      setWsLoading(false);
    }
  };

  const askWorkspaceTopic = async () => {
    const trimmed = topic.trim();
    if (!trimmed || wsRunning) return;
    const token = getToken();
    if (!token) return;
    setWsRunning(true);
    setWsQError("");
    try {
      const r = await fetch(`/api/workspaces/${wsId}/questions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topic: trimmed, persona: wsPersona }),
      });
      if (!r.ok) throw new Error("Không tạo được yêu cầu hỏi đề tài");
      const created = await r.json();
      setTopic("");
      // Poll job (pattern giống các luồng async khác: 1.5s × tối đa 60 lần)
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((res) => setTimeout(res, 1500));
        const jr = await fetch(`/api/jobs/${created.job_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!jr.ok) continue;
        const job = await jr.json();
        if (job.status === "completed" || job.status === "failed") break;
      }
      await loadWorkspaceQuestions();
    } catch (e: any) {
      setWsQError(e.message);
    } finally {
      setWsRunning(false);
    }
  };

  const selectedFile = ws?.files.find((f) => f.document_id === selDocId) ?? null;
  const isZip = selectedFile && (selectedFile.doc_type === "zip" || selectedFile.doc_type === "rar");
  const difficulty = (d: string) => diffCfg[d] ?? diffCfg.medium;
  const personaLabel = (p: string) => PERSONA_LABELS[p] ?? p;

  const allSessions = useMemo(() => {
    if (!sessions) return [];
    return [
      ...sessions.assessments.map((s) => ({
        ...s,
        kind: "💬 Hỏi đáp" as const,
        meta: s.persona ? `Persona: ${s.persona}` : "",
        detail: s.status,
      })),
      ...sessions.code_analyses.map((s) => ({
        ...s,
        kind: "🔍 Code Review" as const,
        meta: s.pass_rate != null ? `Pass rate: ${s.pass_rate}%` : "",
        detail: s.issue_count != null ? `${s.issue_count} vấn đề` : "",
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [sessions]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !ws) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">Không thể tải workspace</h2>
          <p className="text-zinc-500 mb-4">{error || "Workspace không tồn tại."}</p>
          <Link href="/workspaces" className="text-primary font-semibold hover:underline">Quay lại danh sách</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1400px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-zinc-500 font-medium mb-4">
          <Link href="/documents" className="hover:text-primary transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <Link href="/workspaces" className="hover:text-primary transition-colors">Workspace</Link>
          <span className="mx-2">›</span>
          <span className="text-primary font-semibold truncate max-w-[300px]">{ws.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-foreground mb-1">{ws.name}</h1>
            <p className="text-zinc-500 text-[14px]">{ws.document_count} file · Tạo {formatDate(ws.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/workspaces"
              className="px-4 py-2 text-[13px] font-semibold text-zinc-400 bg-card border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              ← Danh sách
            </Link>
          </div>
        </div>

        {ws.files.length === 0 ? (
          <div className="bg-card rounded-2xl border-2 border-dashed border-zinc-700 p-16 text-center">
            <div className="text-5xl mb-4">🗂️</div>
            <h2 className="text-lg font-bold text-zinc-200 mb-2">Workspace chưa có file</h2>
            <p className="text-zinc-500 text-[14px] mb-6">Thêm file từ trang Tài liệu để bắt đầu.</p>
            <Link href="/documents" className="inline-block px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90">
              Đi tới Tài liệu
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
            {/* Left: files sidebar (Windows Explorer style) */}
            <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden lg:h-[calc(100vh-240px)] lg:sticky lg:top-4 flex flex-col">
              <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-800/40 flex items-center gap-2">
                <span className="text-sm">📁</span>
                <span className="text-[13px] font-bold text-zinc-200">Files</span>
                <span className="ml-auto text-[11px] text-zinc-500">{ws.document_count} file</span>
              </div>
              <div className="p-2 overflow-y-auto flex-1">
                {ws.files.map((f) => {
                  const isActive = selDocId === f.document_id;
                  const isZipF = f.doc_type === "zip" || f.doc_type === "rar";
                  const expanded = zipExpanded.has(f.document_id);
                  return (
                    <div key={f.document_id}>
                      <button
                        onClick={() => selectFile(f)}
                        className={`w-full flex items-center gap-2 px-2 py-2 text-[13px] rounded-md text-left ${
                          isActive ? "bg-teal-500/10 text-teal-400 font-semibold" : "text-zinc-400 hover:bg-zinc-800/60"
                        }`}
                      >
                        {isZipF ? (
                          <span className={`text-[10px] text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
                        ) : (
                          <span className="text-[10px] text-zinc-600">•</span>
                        )}
                        <span className="text-[12px] font-bold text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">
                          {f.file_type === ".rar" ? "RAR" : docTypeLabel[f.doc_type] ?? f.file_type}
                        </span>
                        <span className="truncate flex-1">{f.filename}</span>
                      </button>
                      {isZipF && expanded && (
                        <div className="ml-4 border-l border-zinc-800 pl-1">
                          {(zipMembers[f.document_id] ?? []).length === 0 ? (
                            <p className="text-zinc-500 text-[12px] p-2">Đang tải...</p>
                          ) : (
                            <FileTree
                              members={zipMembers[f.document_id] ?? []}
                              selected={selDocId === f.document_id ? selMember : null}
                              onSelect={(path) => {
                                setSelDocId(f.document_id);
                                setSelMember(path);
                                setRightTab("preview");
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: tabs + content */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-1 bg-card rounded-2xl shadow-sm border border-zinc-800/60 p-1 w-fit flex-wrap">
                <button
                  onClick={() => openTab("preview")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "preview" ? "bg-primary text-primary-foreground" : "text-zinc-500 hover:bg-zinc-800/60"
                  }`}
                >
                  👁️ Preview
                </button>
                <button
                  onClick={() => openTab("questions")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "questions" ? "bg-primary text-primary-foreground" : "text-zinc-500 hover:bg-zinc-800/60"
                  }`}
                >
                  ❓ Câu hỏi AI
                </button>
                <button
                  onClick={() => openTab("chat")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "chat" ? "bg-primary text-primary-foreground" : "text-zinc-500 hover:bg-zinc-800/60"
                  }`}
                >
                  💬 Chat đề tài
                </button>
                <button
                  onClick={() => openTab("history")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "history" ? "bg-primary text-primary-foreground" : "text-zinc-500 hover:bg-zinc-800/60"
                  }`}
                >
                  🕘 Lịch sử ({allSessions.length})
                </button>
              </div>

              {rightTab === "preview" && (
                <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden h-[calc(100vh-340px)] min-h-[450px] flex flex-col">
                  {!selectedFile ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                      <span className="text-4xl mb-3">👈</span>
                      <p className="text-[14px]">Chọn một file bên trái để xem nội dung</p>
                    </div>
                  ) : isZip ? (
                    selMember ? (
                      <FilePreview docId={selectedFile.document_id} path={selMember} />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                        <span className="text-4xl mb-3">🗜️</span>
                        <p className="text-[14px]">Mở rộng file nén và chọn 1 file bên trong để xem</p>
                      </div>
                    )
                  ) : (
                    <DocPreview docId={selectedFile.document_id} filename={selectedFile.filename} />
                  )}
                </div>
              )}

              {rightTab === "questions" && (
                <div className="flex flex-col gap-8">
                  {/* R6: "Hỏi theo đề tài" — RAG toàn workspace */}
                  <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 p-5">
                    <h3 className="text-[15px] font-bold text-zinc-200 mb-1">🧭 Hỏi theo đề tài (toàn workspace)</h3>
                    <p className="text-[12px] text-zinc-500 mb-4">AI tìm các đoạn liên quan nhất trong toàn bộ {ws.document_count} file rồi sinh câu hỏi kèm nguồn file:đoạn.</p>
                    <div className="flex flex-col md:flex-row gap-3">
                      <input
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && askWorkspaceTopic()}
                        placeholder="VD: Hệ thống xử lý bảo mật thế nào?"
                        className="flex-1 px-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-[14px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary"
                      />
                      <select
                        value={wsPersona}
                        onChange={(e) => setWsPersona(e.target.value)}
                        className="px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-[13px] text-zinc-300 focus:outline-none focus:border-primary"
                      >
                        {PERSONAS.map((p) => (
                          <option key={p.key} value={p.key}>{p.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={askWorkspaceTopic}
                        disabled={!topic.trim() || wsRunning}
                        className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-[14px] font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {wsRunning ? "Đang xử lý..." : "Hỏi đề tài"}
                      </button>
                    </div>

                    {wsQError && (
                      <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-[13px]">{wsQError}</div>
                    )}

                    {wsLoading ? (
                      <p className="text-zinc-500 text-[13px] py-4 text-center">Đang tải đề tài...</p>
                    ) : wsQuestions.length > 0 ? (
                      <div className="mt-5 flex flex-col gap-5">
                        {wsQuestions.map((wq) => (
                          <div key={wq.id} className="border border-zinc-800/60 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[14px] font-bold text-zinc-200">📌 {wq.topic}</span>
                                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[11px] font-bold rounded-full">{personaLabel(wq.persona)}</span>
                                <span
                                  className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                                    wq.status === "completed"
                                      ? "bg-green-500/10 text-green-400"
                                      : wq.status === "failed"
                                      ? "bg-red-500/10 text-red-400"
                                      : "bg-blue-500/10 text-blue-400"
                                  }`}
                                >
                                  {wq.status}
                                </span>
                              </div>
                              <span className="text-[11px] text-zinc-500">{formatDate(wq.created_at)}</span>
                            </div>
                            {wq.status === "failed" ? (
                              <p className="text-red-400 text-[13px]">{wq.error || "Tạo câu hỏi thất bại."}</p>
                            ) : !wq.questions || wq.questions.length === 0 ? (
                              <p className="text-zinc-500 text-[13px]">Đang xử lý hoặc chưa có câu hỏi.</p>
                            ) : (
                              <div className="flex flex-col gap-3">
                                {wq.questions.map((q) => {
                                  const d = difficulty(q.difficulty);
                                  return (
                                    <div key={q.id} className="bg-zinc-900/60 rounded-xl p-4">
                                      <div className="flex items-center gap-2 flex-wrap mb-2">
                                        <span className={`px-2.5 py-1 ${d.bg} ${d.txt} text-[11px] font-bold rounded-full`}>{d.label}</span>
                                        <span className="text-[11px] text-zinc-500 font-medium">#{q.id}</span>
                                      </div>
                                      <h4 className="text-[14px] font-bold text-teal-400 leading-snug">{renderWithRefs(q.question)}</h4>
                                      {(!wq.sources || wq.sources.length === 0) && q.citations && q.citations.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {q.citations.map((c, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-semibold rounded-md">📎 {c}</span>
                                          ))}
                                        </div>
                                      )}
                                      {q.hint && <p className="mt-2 text-zinc-500 text-[12px] italic">💡 {q.hint}</p>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {!!wq.sources && wq.sources.length > 0 && (
                              <details className="mt-3 border border-zinc-800/60 rounded-lg">
                                <summary className="cursor-pointer px-3 py-2 text-[12px] font-bold text-zinc-300 select-none">📚 Nguồn tham khảo ({wq.sources.length})</summary>
                                <div className="px-3 pb-3 flex flex-col gap-2">
                                  {wq.sources.map((s) => (
                                    <div key={s.num} className="text-[12px]">
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
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {rightTab === "chat" && (
                <WorkspaceChat workspaceId={wsId} />
              )}

              {rightTab === "history" && (
                <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-800/40 flex items-center gap-2">
                    <span className="text-[13px] font-bold text-zinc-200">🕘 Lịch sử phiên</span>
                  </div>
                  {loadingSessions ? (
                    <p className="text-zinc-500 text-[13px] p-5">Đang tải lịch sử...</p>
                  ) : allSessions.length === 0 ? (
                    <p className="text-zinc-500 text-[13px] p-5">Chưa có phiên nào cho workspace này.</p>
                  ) : (
                    <div className="divide-y divide-zinc-800/60">
                      {allSessions.map((s) => (
                        <div key={`${s.kind}-${s.id}`} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-zinc-800/40">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-bold text-zinc-500">{s.kind}</span>
                              <span className="text-[13px] font-semibold text-zinc-200 truncate">{s.document_name}</span>
                              {s.meta && <span className="text-[11px] text-zinc-500">{s.meta}</span>}
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">{s.detail} · {formatDate(s.created_at)}</div>
                          </div>
                          <Link
                            href={s.kind.includes("Code") ? "/code-review" : `/documents/${s.document_id}`}
                            className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors shrink-0"
                          >
                            Xem
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
