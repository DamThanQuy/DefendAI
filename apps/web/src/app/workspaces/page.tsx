"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

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

interface WorkspacesResponse {
  total: number;
  items: Workspace[];
}

interface DocumentItem {
  id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  status: string;
}

interface SessionItem {
  id: number;
  document_id: number;
  document_name: string;
  persona?: string;
  status: string;
  issue_count?: number | null;
  created_at: string;
}

interface SessionsResponse {
  workspace_id: number;
  workspace_name: string;
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

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameWs, setRenameWs] = useState<Workspace | null>(null);
  const [renameName, setRenameName] = useState("");
  const [addWs, setAddWs] = useState<Workspace | null>(null);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());

  // Session history
  const [openSessions, setOpenSessions] = useState<Set<number>>(new Set());
  const [sessionsCache, setSessionsCache] = useState<Record<number, SessionsResponse>>({});
  const [loadingSessions, setLoadingSessions] = useState<Set<number>>(new Set());

  const fetchWorkspaces = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch("/api/workspaces/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch");
      const data: WorkspacesResponse = await r.json();
      setWorkspaces(data.items ?? []);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleCreate = async () => {
    const token = getToken();
    if (!token || !newName.trim()) return;
    try {
      const r = await fetch("/api/workspaces/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!r.ok) throw new Error("Tạo workspace thất bại");
      setNewName("");
      setShowCreate(false);
      await fetchWorkspaces();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRename = async () => {
    const token = getToken();
    if (!token || !renameWs || !renameName.trim()) return;
    try {
      const r = await fetch(`/api/workspaces/${renameWs.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (!r.ok) throw new Error("Đổi tên thất bại");
      setRenameWs(null);
      await fetchWorkspaces();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (ws: Workspace) => {
    const token = getToken();
    if (!token) return;
    if (!window.confirm(`Xoá workspace "${ws.name}"? File gốc không bị xoá.`)) return;
    try {
      const r = await fetch(`/api/workspaces/${ws.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Xoá thất bại");
      await fetchWorkspaces();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const openAddModal = async (ws: Workspace) => {
    setAddWs(ws);
    setSelectedDocIds(new Set(ws.files.map((f) => f.document_id)));
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch("/api/documents/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setDocs(data.items ?? []);
      }
    } catch {
      // ignore — modal vẫn mở, list trống
    }
  };

  const toggleDoc = (id: number) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddFiles = async () => {
    const token = getToken();
    if (!token || !addWs) return;
    const existing = new Set(addWs.files.map((f) => f.document_id));
    for (const docId of selectedDocIds) {
      if (existing.has(docId)) continue; // đã có — bỏ qua, tránh 409
      await fetch(`/api/workspaces/${addWs.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_id: docId, role: "main" }),
      });
    }
    setAddWs(null);
    await fetchWorkspaces();
  };

  const handleRemoveFile = async (ws: Workspace, docId: number) => {
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(`/api/workspaces/${ws.id}/files/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Gỡ file thất bại");
      await fetchWorkspaces();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleSessions = async (ws: Workspace) => {
    const token = getToken();
    if (!token) return;
    if (openSessions.has(ws.id)) {
      const next = new Set(openSessions);
      next.delete(ws.id);
      setOpenSessions(next);
      return;
    }
    // Mở + fetch lịch sử nếu chưa có
    setOpenSessions((prev) => new Set(prev).add(ws.id));
    if (sessionsCache[ws.id]) return;
    setLoadingSessions((prev) => new Set(prev).add(ws.id));
    try {
      const r = await fetch(`/api/workspaces/${ws.id}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data: SessionsResponse = await r.json();
        setSessionsCache((prev) => ({ ...prev, [ws.id]: data }));
      }
    } finally {
      setLoadingSessions((prev) => {
        const next = new Set(prev);
        next.delete(ws.id);
        return next;
      });
    }
  };

  const token = typeof window !== "undefined" ? getToken() : null;

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground mb-2">Vui lòng đăng nhập</h2>
          <Link href="/login" className="text-primary font-semibold hover:underline">Đăng nhập ngay</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1100px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-zinc-500 font-medium mb-6">
          <Link href="/documents" className="hover:text-primary transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <span className="text-primary font-semibold">Workspace</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-[28px] font-bold text-foreground mb-2">Workspace của tôi</h1>
            <p className="text-zinc-500 text-[14px]">Gom nhiều tài liệu vào 1 đề tài, xem lịch sử phiên hỏi đáp &amp; code review.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90 transition-colors shrink-0"
          >
            + Tạo workspace
          </button>
        </div>

        {loading && (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-500 text-[14px]">Đang tải danh sách...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-[14px] mb-6">{error}</div>
        )}

        {!loading && !error && workspaces.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-foreground mb-2">Chưa có workspace nào</h2>
            <p className="text-zinc-500 text-[14px] mb-6">Tạo workspace để gom tài liệu theo đề tài của bạn.</p>
            <button onClick={() => setShowCreate(true)} className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-semibold hover:bg-primary/90">
              Tạo workspace đầu tiên
            </button>
          </div>
        )}

        {/* Workspace cards */}
        <div className="grid gap-5">
          {workspaces.map((ws) => (
            <div key={ws.id} className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden">
              {/* Card header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                  </div>
                  <div>
                    <Link href={`/workspaces/${ws.id}`} className="text-[16px] font-bold text-zinc-200 hover:text-primary hover:underline transition-colors">
                      {ws.name}
                    </Link>
                    <p className="text-[12px] text-zinc-500">{ws.document_count} file · Tạo {formatDate(ws.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRenameWs(ws)}
                    className="px-3 py-1.5 text-[12px] font-semibold text-zinc-400 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
                  >
                    ✏️ Đổi tên
                  </button>
                  <button
                    onClick={() => handleDelete(ws)}
                    className="px-3 py-1.5 text-[12px] font-semibold text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    🗑️ Xoá
                  </button>
                  <button
                    onClick={() => openAddModal(ws)}
                    className="px-3 py-1.5 text-[12px] font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    + Thêm file
                  </button>
                </div>
              </div>

              {/* Files list */}
              {ws.files.length === 0 ? (
                <div className="px-5 py-6 text-center text-zinc-500 text-[13px]">Chưa có file — bấm "+ Thêm file" để gom tài liệu vào đề tài này.</div>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {ws.files.map((f) => (
                    <div key={f.document_id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-zinc-800/40">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[12px] font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded shrink-0">
                          {f.file_type === ".rar" ? "RAR" : docTypeLabel[f.doc_type] ?? f.file_type}
                        </span>
                        <span className="text-[14px] font-medium text-zinc-300 truncate">{f.filename}</span>
                        {f.role === "attachment" && (
                          <span className="text-[11px] text-zinc-500 bg-zinc-800/40 px-1.5 py-0.5 rounded border border-zinc-700">attachment</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {f.doc_type === "zip" && (
                          <Link
                            href={`/code-review?doc=${f.document_id}`}
                            className="px-3 py-1.5 text-[12px] font-semibold text-zinc-300 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
                          >
                            🔍 Code Review
                          </Link>
                        )}
                        <Link
                          href={`/documents/${f.document_id}`}
                          className="px-3 py-1.5 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                        >
                          Tạo câu hỏi
                        </Link>
                        <button
                          onClick={() => handleRemoveFile(ws, f.document_id)}
                          className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Gỡ khỏi workspace"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Session history */}
              {openSessions.has(ws.id) && (
                <div className="border-t border-zinc-800/60 bg-zinc-900/40 px-5 py-4">
                  {loadingSessions.has(ws.id) ? (
                    <p className="text-zinc-500 text-[13px]">Đang tải lịch sử...</p>
                  ) : (
                    <SessionsView sessions={sessionsCache[ws.id]} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 border border-zinc-800/60" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-foreground mb-4">Tạo workspace mới</h3>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Tên đề tài (vd: Đồ án quản lý nhà trọ)"
              className="w-full border border-zinc-700 rounded-lg px-4 py-2.5 text-[14px] bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 mb-4 text-zinc-200"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-[13px] font-semibold text-zinc-500 hover:bg-zinc-800 rounded-lg">
                Huỷ
              </button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="px-4 py-2 text-[13px] font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
                Tạo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {renameWs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setRenameWs(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 border border-zinc-800/60" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-foreground mb-4">Đổi tên workspace</h3>
            <input
              autoFocus
              value={renameName || renameWs.name}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="w-full border border-zinc-700 rounded-lg px-4 py-2.5 text-[14px] bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 mb-4 text-zinc-200"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRenameWs(null)} className="px-4 py-2 text-[13px] font-semibold text-zinc-500 hover:bg-zinc-800 rounded-lg">
                Huỷ
              </button>
              <button onClick={handleRename} disabled={!renameName.trim()} className="px-4 py-2 text-[13px] font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add files modal */}
      {addWs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setAddWs(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col border border-zinc-800/60" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/60">
              <h3 className="text-[16px] font-bold text-foreground">Thêm file vào "{addWs.name}"</h3>
              <button onClick={() => setAddWs(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-800 text-zinc-500">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {docs.length === 0 && <p className="text-center text-zinc-500 text-[13px] py-8">Chưa có tài liệu nào trong thùng. Vào trang Tài liệu để upload.</p>}
              {docs.map((doc) => {
                const checked = selectedDocIds.has(doc.id);
                return (
                  <label key={doc.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${checked ? "bg-teal-500/10" : "hover:bg-zinc-800/50"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleDoc(doc.id)} className="w-4 h-4 accent-teal-500" />
                    <span className="text-[12px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded shrink-0">
                      {doc.file_type === ".rar" ? "RAR" : docTypeLabel[doc.doc_type] ?? doc.file_type}
                    </span>
                    <span className="text-[14px] font-medium text-zinc-300 truncate">{doc.filename}</span>
                  </label>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-zinc-800/60 flex justify-end gap-2">
              <button onClick={() => setAddWs(null)} className="px-4 py-2 text-[13px] font-semibold text-zinc-500 hover:bg-zinc-800 rounded-lg">Huỷ</button>
              <button onClick={handleAddFiles} className="px-4 py-2 text-[13px] font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90">
                Thêm ({selectedDocIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Sessions view =====
function SessionsView({ sessions }: { sessions?: SessionsResponse }) {
  if (!sessions) return null;

  const all = [
    ...sessions.assessments.map((s) => ({
      ...s,
      kind: "💬 Hỏi đáp" as const,
      meta: s.persona ? `Persona: ${s.persona}` : "",
      detail: s.status,
    })),
    ...sessions.code_analyses.map((s) => ({
      ...s,
      kind: "🔍 Code Review" as const,
        meta: "",
      detail: s.issue_count != null ? `${s.issue_count} vấn đề` : "",
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (all.length === 0) {
    return <p className="text-zinc-500 text-[13px]">Chưa có phiên nào cho workspace này.</p>;
  }

  return (
    <div className="divide-y divide-zinc-800/60">
      {all.map((s) => (
        <div key={`${s.kind}-${s.id}`} className="py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-bold text-zinc-500">{s.kind}</span>
              <span className="text-[13px] font-semibold text-zinc-200 truncate">{s.document_name}</span>
              {s.meta && <span className="text-[11px] text-zinc-500">{s.meta}</span>}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{s.detail} · {new Date(s.created_at + "Z").toLocaleString("vi-VN")}</div>
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
  );
}
