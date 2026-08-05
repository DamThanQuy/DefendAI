"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { PERSONA_LABELS } from "@/lib/constants";
import { FileTree } from "@/components/features/assessment/FileTree";
import { FilePreview } from "@/components/features/assessment/FilePreview";

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
}

interface AssessmentResponse {
  assessment_id: number;
  document_id: number;
  document_name: string;
  doc_type: string;
  persona: string;
  status: string;
  questions: Question[];
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

const docTypeLabel: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  zip: "ZIP",
  rar: "RAR",
};

const diffCfg: Record<string, { label: string; bg: string; txt: string }> = {
  easy: { label: "Dễ", bg: "bg-green-50", txt: "text-green-700" },
  medium: { label: "Trung bình", bg: "bg-blue-50", txt: "text-blue-600" },
  hard: { label: "Khó", bg: "bg-red-50", txt: "text-[#d32f2f]" },
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

  if (loading) return <div className="h-full flex items-center justify-center text-gray-500 text-[14px]">Đang tải nội dung...</div>;
  if (error) return <div className="p-6 text-red-600 text-[14px]">{error}</div>;
  if (!content) return null;

  const isMd = filename.toLowerCase().endsWith(".md");

  if (content.type === "binary") {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 overflow-auto">
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
        <article className="prose prose-sm max-w-none text-gray-800 leading-relaxed">
          <ReactMarkdown>{content.text}</ReactMarkdown>
        </article>
      </div>
    );
  }

  return (
    <pre className="flex-1 overflow-auto p-4 text-[13px] leading-relaxed font-mono text-gray-800 whitespace-pre">
      {content.text}
    </pre>
  );
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
  const [rightTab, setRightTab] = useState<"preview" | "questions" | "history">("preview");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Questions
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [qError, setQError] = useState("");

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

  const loadQuestions = async () => {
    const token = getToken();
    if (!token || !selDocId) return;
    setLoadingQuestions(true);
    setQError("");
    try {
      const r = await fetch(`/api/documents/${selDocId}/assessments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Không thể tải câu hỏi");
      const data = await r.json();
      const items = data.items ?? [];
      if (items.length === 0) {
        setQuestions([]);
        return;
      }
      const latest = items[0];
      const qr = await fetch(`/api/questions/${latest.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!qr.ok) throw new Error("Không thể tải câu hỏi");
      const payload: AssessmentResponse = await qr.json();
      setQuestions(payload.questions ?? []);
    } catch (e: any) {
      setQError(e.message);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const openTab = (tab: "preview" | "questions" | "history") => {
    setRightTab(tab);
    if (tab === "questions" && questions.length === 0 && !qError && !loadingQuestions) loadQuestions();
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

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0f2e82] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !ws) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#0f2e82] mb-2">Không thể tải workspace</h2>
          <p className="text-gray-500 mb-4">{error || "Workspace không tồn tại."}</p>
          <Link href="/workspaces" className="text-[#0f2e82] font-semibold hover:underline">Quay lại danh sách</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1400px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-gray-500 font-medium mb-4">
          <Link href="/" className="hover:text-[#0f2e82] transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <Link href="/workspaces" className="hover:text-[#0f2e82] transition-colors">Workspace</Link>
          <span className="mx-2">›</span>
          <span className="text-[#0f2e82] font-semibold truncate max-w-[300px]">{ws.name}</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-[#0f2e82] mb-1">{ws.name}</h1>
            <p className="text-[#5f6368] text-[14px]">{ws.document_count} file · Tạo {formatDate(ws.created_at)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/workspaces"
              className="px-4 py-2 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Danh sách
            </Link>
          </div>
        </div>

        {ws.files.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-16 text-center">
            <div className="text-5xl mb-4">🗂️</div>
            <h2 className="text-lg font-bold text-gray-800 mb-2">Workspace chưa có file</h2>
            <p className="text-gray-500 text-[14px] mb-6">Thêm file từ trang Tài liệu để bắt đầu.</p>
            <Link href="/documents" className="inline-block px-5 py-2.5 bg-[#0f2e82] text-white rounded-lg text-[14px] font-semibold hover:bg-[#1a3a9c]">
              Đi tới Tài liệu
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
            {/* Left: files sidebar (Windows Explorer style) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden lg:h-[calc(100vh-240px)] lg:sticky lg:top-4 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <span className="text-sm">📁</span>
                <span className="text-[13px] font-bold text-gray-800">Files</span>
                <span className="ml-auto text-[11px] text-gray-500">{ws.document_count} file</span>
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
                          isActive ? "bg-blue-50 text-[#0f2e82] font-semibold" : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {isZipF ? (
                          <span className={`text-[10px] text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
                        ) : (
                          <span className="text-[10px] text-gray-300">•</span>
                        )}
                        <span className="text-[12px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                          {f.file_type === ".rar" ? "RAR" : docTypeLabel[f.doc_type] ?? f.file_type}
                        </span>
                        <span className="truncate flex-1">{f.filename}</span>
                      </button>
                      {isZipF && expanded && (
                        <div className="ml-4 border-l border-gray-100 pl-1">
                          {(zipMembers[f.document_id] ?? []).length === 0 ? (
                            <p className="text-gray-400 text-[12px] p-2">Đang tải...</p>
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
              <div className="flex items-center gap-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-1 w-fit flex-wrap">
                <button
                  onClick={() => openTab("preview")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "preview" ? "bg-[#0f2e82] text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  👁️ Preview
                </button>
                <button
                  onClick={() => openTab("questions")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "questions" ? "bg-[#0f2e82] text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  ❓ Câu hỏi AI
                </button>
                <button
                  onClick={() => openTab("history")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "history" ? "bg-[#0f2e82] text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  🕘 Lịch sử ({allSessions.length})
                </button>
              </div>

              {rightTab === "preview" && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-[calc(100vh-340px)] min-h-[450px] flex flex-col">
                  {!selectedFile ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <span className="text-4xl mb-3">👈</span>
                      <p className="text-[14px]">Chọn một file bên trái để xem nội dung</p>
                    </div>
                  ) : isZip ? (
                    selMember ? (
                      <FilePreview docId={selectedFile.document_id} path={selMember} />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400">
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
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[15px] font-bold text-gray-800">
                      ❓ Câu hỏi phản biện {selectedFile ? `— ${selectedFile.filename}` : ""}
                    </h3>
                    <Link
                      href={selectedFile ? `/documents/${selectedFile.document_id}` : "/documents"}
                      className="px-3 py-1.5 text-[12px] font-semibold text-[#0f2e82] bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Tạo câu hỏi mới →
                    </Link>
                  </div>

                  {loadingQuestions ? (
                    <p className="text-gray-400 text-[14px] py-10 text-center">Đang tải câu hỏi...</p>
                  ) : qError ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-[14px]">{qError}</div>
                  ) : questions.length === 0 ? (
                    <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
                      <div className="text-4xl mb-3">💬</div>
                      <p className="text-gray-500 text-[14px] mb-4">File này chưa có câu hỏi nào. Bấm "Tạo câu hỏi mới" để AI sinh câu hỏi phản biện.</p>
                      <Link
                        href={selectedFile ? `/documents/${selectedFile.document_id}` : "/documents"}
                        className="inline-block px-5 py-2.5 bg-[#0f2e82] text-white rounded-lg text-[14px] font-semibold hover:bg-[#1a3a9c]"
                      >
                        Tạo câu hỏi
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {questions.map((q) => {
                        const d = difficulty(q.difficulty);
                        return (
                          <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2.5 py-1 ${d.bg} ${d.txt} text-[11px] font-bold rounded-full`}>{d.label}</span>
                                <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-full">{personaLabel(q.persona)}</span>
                              </div>
                              <span className="text-[11px] text-gray-400 font-medium">#{q.id}</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-[#0f2e82] leading-snug">{q.question}</h3>
                            <div className="bg-[#f8f9fa] rounded-xl overflow-hidden">
                              <button
                                onClick={() => toggleExpand(q.id)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                              >
                                <span className="flex items-center gap-2 text-[#0f2e82] font-semibold text-[13px]">💡 Gợi ý trả lời</span>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedIds.has(q.id) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {expandedIds.has(q.id) && (
                                <div className="px-4 pb-3">
                                  <p className="text-gray-600 text-[13px] leading-relaxed italic">{q.hint}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {rightTab === "history" && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                    <span className="text-[13px] font-bold text-gray-800">🕘 Lịch sử phiên</span>
                  </div>
                  {loadingSessions ? (
                    <p className="text-gray-400 text-[13px] p-5">Đang tải lịch sử...</p>
                  ) : allSessions.length === 0 ? (
                    <p className="text-gray-400 text-[13px] p-5">Chưa có phiên nào cho workspace này.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {allSessions.map((s) => (
                        <div key={`${s.kind}-${s.id}`} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-gray-50/50">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-bold text-gray-500">{s.kind}</span>
                              <span className="text-[13px] font-semibold text-gray-800 truncate">{s.document_name}</span>
                              {s.meta && <span className="text-[11px] text-gray-400">{s.meta}</span>}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">{s.detail} · {formatDate(s.created_at)}</div>
                          </div>
                          <Link
                            href={s.kind.includes("Code") ? "/code-review" : `/documents/${s.document_id}`}
                            className="px-3 py-1 text-[12px] font-semibold text-[#0f2e82] bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors shrink-0"
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
