"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { UploadModal } from "@/components/features/assessment/UploadModal";
import { ArchiveBrowser } from "@/components/features/assessment/ArchiveBrowser";

interface DocumentItem {
  id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  status: string;
  purpose: string;
  created_at: string;
}

interface DocumentsResponse {
  total: number;
  items: DocumentItem[];
}

interface WorkspaceItem {
  id: number;
  name: string;
  document_count: number;
}

const docTypeLabel: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  zip: "ZIP",
  rar: "RAR",
};

function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [browseDoc, setBrowseDoc] = useState<DocumentItem | null>(null);

  // Thêm vào workspace
  const [wsTargetDoc, setWsTargetDoc] = useState<DocumentItem | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);

  useEffect(() => {
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tách fetch thành hàm để có thể gọi lại khi đóng modal upload (cập nhật list tài liệu mới)
  const fetchDocs = async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const r = await fetch("/api/documents/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to fetch");
      const data: DocumentsResponse = await r.json();
      setDocs(data.items ?? []);
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

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

  // Mở modal chọn workspace cho 1 document
  const openWsModal = async (doc: DocumentItem) => {
    setWsTargetDoc(doc);
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch("/api/workspaces/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) {
        const data = await r.json();
        setWorkspaces(data.items ?? []);
      }
    } catch {
      // bỏ qua — modal vẫn mở
    }
  };

  // Thêm doc vào workspace được chọn
  const handleAddToWorkspace = async (wsId: number) => {
    if (!wsTargetDoc) return;
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(`/api/workspaces/${wsId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_id: wsTargetDoc.id, role: "main" }),
      });
      if (!r.ok) throw new Error("Thêm vào workspace thất bại");
      setWsTargetDoc(null);
    } catch (e: any) {
      setError(e.message);
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
        <nav className="flex items-center text-[13px] font-medium mb-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            Trang chủ
          </Link>
          <span className="mx-2 text-muted-foreground/50">›</span>
          <span className="text-primary font-semibold">Tài liệu</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-serif font-black text-foreground mb-2">
              Tài liệu của tôi
            </h1>
            <p className="text-muted-foreground text-[14px]">
              Quản lý tài liệu đã tải lên cho buổi bảo vệ.
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-[14px] font-semibold shadow-[0_0_18px_hsl(var(--primary)/0.4)] hover:brightness-110 transition-all shrink-0"
          >
            + Tải lên tài liệu mới
          </button>
        </div>

        {loading && (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground text-[14px]">Đang tải danh sách...</p>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 text-destructive text-[14px] mb-6">
            {error}
          </div>
        )}

        {!loading && !error && docs.length === 0 && (
          <div className="text-center py-20 dark-card rounded-3xl">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-serif font-bold text-foreground mb-2">
              Chưa có tài liệu nào
            </h2>
            <p className="text-muted-foreground text-[14px] mb-6">
              Tải lên tài liệu đầu tiên để bắt đầu.
            </p>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-[14px] font-semibold hover:brightness-110 shadow-[0_0_18px_hsl(var(--primary)/0.4)]"
            >
              Tải lên ngay
            </button>
          </div>
        )}

        {!loading && docs.length > 0 && (
          <div className="dark-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-5 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Tên file</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Loại</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Ngày tải lên</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id} className="border-b border-border hover:bg-muted/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <span className="text-[14px] font-semibold text-foreground truncate max-w-[300px]">
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[12px] font-bold text-secondary bg-secondary/10 px-2 py-1 rounded">
                          {doc.file_type === ".rar" ? "RAR" : docTypeLabel[doc.doc_type] ?? doc.file_type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-muted-foreground">{formatDate(doc.created_at)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {doc.doc_type === "zip" && (
                            <button
                              onClick={() => setBrowseDoc(doc)}
                              className="px-3 py-1.5 text-[12px] font-semibold text-foreground bg-muted rounded-lg hover:bg-muted/70 transition-colors"
                            >
                              Xem nội dung
                            </button>
                          )}
                          <button
                            onClick={() => openWsModal(doc)}
                            className="px-3 py-1.5 text-[12px] font-semibold text-emerald-500 bg-emerald-500/10 rounded-lg hover:bg-emerald-500/20 transition-colors"
                          >
                            ➕ Workspace
                          </button>
                          <a
                            href={`/api/documents/${doc.id}/download`}
                            className="px-3 py-1.5 text-[12px] font-semibold text-muted-foreground bg-muted/40 rounded-lg hover:bg-muted transition-colors"
                          >
                            Tải xuống
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <UploadModal open={showUpload} onClose={() => { setShowUpload(false); fetchDocs(); }} />

      {/* Archive browser modal */}
      {browseDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setBrowseDoc(null)}>
          <div
            className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-border/60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
              <h3 className="text-[16px] font-bold text-foreground">Nội dung file</h3>
              <button
                onClick={() => setBrowseDoc(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ArchiveBrowser docId={browseDoc.id} filename={browseDoc.filename} />
            </div>
          </div>
        </div>
      )}

      {/* Add to workspace modal */}
      {wsTargetDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setWsTargetDoc(null)}>
          <div
            className="bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 border border-border/60"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-bold text-foreground mb-1">Thêm vào workspace</h3>
            <p className="text-[13px] text-muted-foreground mb-4 truncate">{wsTargetDoc.filename}</p>

            {workspaces.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-[13px] mb-4">Chưa có workspace nào.</p>
                <Link
                  href="/workspaces"
                  onClick={() => setWsTargetDoc(null)}
                  className="inline-block px-4 py-2 text-[13px] font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90"
                >
                  Tạo workspace đầu tiên
                </Link>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleAddToWorkspace(ws.id)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-teal-500/10 transition-colors text-left"
                  >
                    <span className="text-[14px] font-semibold text-foreground">{ws.name}</span>
                    <span className="text-[12px] text-muted-foreground">{ws.document_count} file</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button
                onClick={() => setWsTargetDoc(null)}
                className="px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-muted rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}