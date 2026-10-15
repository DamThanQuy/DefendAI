"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { DocumentDetailSidebar } from "@/components/features/assessment/DocumentDetailSidebar";

interface DocumentItem {
  id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  status: string;
  purpose: string;
  created_at: string;
  uploaded_by?: number | null;
  size?: number | null;
}

interface DocumentsResponse {
  total: number;
  items: DocumentItem[];
}

interface UserSummary {
  id: number;
  full_name: string | null;
}

const docTypeLabel: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  zip: "ZIP",
  rar: "RAR",
};

function formatFileSize(bytes?: number | null): string {
  if (bytes == null || bytes === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

export default function MentorDocumentsPage() {
  const { user, hasRole } = useAuth();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [browseDoc, setBrowseDoc] = useState<DocumentItem | null>(null);
  const [userNames, setUserNames] = useState<Record<number, string>>({});

  const isAdminOrMentor =
    (user?.roles ?? []).some((r) => r === "admin" || r === "mentor");

  useEffect(() => {
    if (hasRole && !hasRole("mentor") && !hasRole("admin")) return;
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDocs = async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      // Mentor/admin được xem TẤT CẢ documents (backend _is_privileged cho phép).
      const r = await fetch("/api/documents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const errJson = await r.json().catch(() => null);
        throw new Error(
          errJson?.detail || errJson?.message || `Lỗi tải danh sách tài liệu (${r.status})`,
        );
      }
      const data: DocumentsResponse = await r.json();
      setDocs(data.items ?? []);
      setError("");
      // Fetch tên user cho từng uploaded_by (để cột "Người upload")
      await fetchUserNames(data.items ?? []);
    } catch (e: any) {
      setError(e.message || "Không thể kết nối đến máy chủ");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserNames = async (items: DocumentItem[]) => {
    const ids = [...new Set(items.map((d) => d.uploaded_by).filter((x): x is number => x != null))];
    if (ids.length === 0) return;
    const token = getToken();
    if (!token) return;
    const cache: Record<number, string> = {};
    for (const id of ids) {
      try {
        const r = await fetch(`/api/users/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const data: UserSummary = await r.json();
          cache[id] = data.full_name || `User #${id}`;
        } else {
          cache[id] = `User #${id}`;
        }
      } catch {
        cache[id] = `User #${id}`;
      }
    }
    setUserNames((prev) => ({ ...prev, ...cache }));
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

  const token = typeof window !== "undefined" ? getToken() : null;

  if (!isAdminOrMentor) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Tài liệu học viên</h1>
        <p className="text-sm text-muted-foreground">
          Trang này chỉ dành cho Mentor / Admin.
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Tài liệu học viên</h1>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Vui lòng đăng nhập để xem tài liệu.{" "}
          <Link href="/login" className="underline">Đăng nhập</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Tài liệu học viên</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Danh sách mọi tài liệu đã tải lên hệ thống. Bạn là Mentor/Admin nên được xem tất cả.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-12 text-sm text-muted-foreground">Đang tải danh sách...</div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Chưa có tài liệu nào.
        </div>
      )}

      {!loading && docs.length > 0 && (
        <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Tên file
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Loại
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Dung lượng
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Người upload
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Ngày tải lên
                  </th>
                  <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-border/60 hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() => setBrowseDoc(doc)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-foreground truncate max-w-[260px]">
                      {doc.filename}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {docTypeLabel[doc.doc_type] ?? doc.file_type ?? doc.doc_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatFileSize(doc.size)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {doc.uploaded_by != null
                        ? userNames[doc.uploaded_by] ?? `User #${doc.uploaded_by}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(doc.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setBrowseDoc(doc);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-foreground bg-muted rounded-lg hover:bg-border transition-colors"
                      >
                        Chi tiết
                      </button>
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-2 inline-block px-3 py-1.5 text-xs font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                      >
                        Tải xuống
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DocumentDetailSidebar doc={browseDoc} onClose={() => setBrowseDoc(null)} />
    </div>
  );
}
