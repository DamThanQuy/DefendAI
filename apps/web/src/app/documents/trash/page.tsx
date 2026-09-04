"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { TrashIcon } from "@/components/icons/TrashIcon";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

interface TrashItem {
  id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  status: string;
  purpose: string;
  created_at: string;
  uploaded_by?: number | null;
  deleted_at: string | null;
  deleted_by: number | null;
}

interface TrashResponse {
  total: number;
  items: TrashItem[];
}

function getToken(): string | null {
  return localStorage.getItem("access_token");
}

const docTypeLabel: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  zip: "ZIP",
  rar: "RAR",
};

const RETENTION_DAYS = 30;

function daysUntilPurge(deletedAt: string | null): number | null {
  if (!deletedAt) return null;
  const deleted = new Date(deletedAt).getTime();
  const purge = deleted + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return Math.max(0, Math.ceil((purge - now) / (24 * 60 * 60 * 1000)));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function TrashPage() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<TrashItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrashItem | null>(null);

  const fetchTrash = async () => {
    const token = getToken();
    if (!token) {
      setError("Chưa đăng nhập");
      setLoading(false);
      return;
    }
    try {
      const r = await fetch("/api/documents/trash", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: TrashResponse = await r.json();
      setItems(data.items ?? []);
      setError("");
    } catch (e: any) {
      setError(e.message || "Lỗi tải thùng rác");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

  const handleRestore = async (id: number, filename: string) => {
    if (!window.confirm(`Khôi phục "${filename}"? File sẽ quay lại danh sách tài liệu.`)) return;
    setRestoringId(id);
    try {
      const token = getToken();
      const r = await fetch(`/api/documents/${id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      await fetchTrash();
    } catch (e: any) {
      window.alert(`Khôi phục thất bại: ${e.message || e}`);
    } finally {
      setRestoringId(null);
    }
  };

  const confirmRestore = async () => {
    const item = restoreTarget;
    if (!item) return;
    const id = item.id;
    setRestoreTarget(null);
    setRestoringId(id);
    try {
      const token = getToken();
      const r = await fetch(`/api/documents/${id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      await fetchTrash();
    } catch (e: any) {
      setError(`Khôi phục thất bại: ${e.message || e}`);
    } finally {
      setRestoringId(null);
    }
  };

  const confirmDelete = async () => {
    const item = deleteTarget;
    if (!item) return;
    const id = item.id;
    setDeleteTarget(null);
    setDeletingId(id);
    try {
      const token = getToken();
      const r = await fetch(`/api/documents/${id}/permanent-delete`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      await fetchTrash();
    } catch (e: any) {
      setError(`Xóa vĩnh viễn thất bại: ${e.message || e}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <Link
              href="/documents"
              className="text-[13px] text-zinc-400 hover:text-foreground inline-flex items-center gap-1 mb-2"
            >
              ← Quay lại Tài liệu
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrashIcon className="w-6 h-6 text-zinc-400" />
              Thùng rác
            </h1>
            <p className="text-zinc-500 text-[14px] mt-1">
              File bị xoá sẽ được giữ {RETENTION_DAYS} ngày rồi tự động xoá vĩnh viễn.
            </p>
          </div>
          <div className="text-[13px] text-zinc-400">
            Tổng: <span className="text-foreground font-semibold">{items.length}</span>
          </div>
        </div>

        {loading && (
          <div className="text-center py-20 text-zinc-500">Đang tải…</div>
        )}

        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 text-[14px]">
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="bg-card border border-zinc-800/60 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <TrashIcon className="w-8 h-8 text-zinc-500" />
            </div>
            <h2 className="text-lg font-bold mb-2">Thùng rác trống</h2>
            <p className="text-zinc-500 text-[14px]">
              Các tài liệu bạn xoá sẽ xuất hiện ở đây trong {RETENTION_DAYS} ngày.
            </p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800/60 bg-zinc-800/40">
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Tên file
                    </th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Loại
                    </th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Ngày xoá
                    </th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Tự xoá sau
                    </th>
                    <th className="px-5 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-right">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const days = daysUntilPurge(item.deleted_at);
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-zinc-800/60 hover:bg-zinc-800/40 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <span className="text-[14px] font-medium">{item.filename}</span>
                        </td>
                        <td className="px-5 py-4 text-[13px] text-zinc-400">
                          {docTypeLabel[item.doc_type] || item.file_type || "—"}
                        </td>
                        <td className="px-5 py-4 text-[13px] text-zinc-400">
                          {formatDate(item.deleted_at)}
                        </td>
                        <td className="px-5 py-4 text-[13px]">
                          {days === null ? (
                            <span className="text-zinc-500">—</span>
                          ) : days <= 0 ? (
                            <span className="text-red-400 font-semibold">Sắp purge</span>
                          ) : days <= 3 ? (
                            <span className="text-orange-400 font-semibold">{days} ngày</span>
                          ) : (
                            <span className="text-zinc-300">{days} ngày</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right flex justify-end gap-2">
                          <button
                            onClick={() => setRestoreTarget(item)}
                            disabled={restoringId === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[13px] font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                            title="Khôi phục"
                          >
                            ↩ Khôi phục
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            disabled={deletingId === item.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[13px] font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            title="Xóa vĩnh viễn"
                          >
                            🗑 Xóa vĩnh viễn
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!restoreTarget}
        tone="info"
        icon="restore_from_trash"
        title="Khôi phục tài liệu này?"
        description={
          <>
            Tài liệu <span className="font-semibold text-foreground">"{restoreTarget?.filename}"</span> sẽ được khôi phục về danh sách tài liệu chính và có thể sử dụng như bình thường.
          </>
        }
        confirmLabel={restoringId ? "Đang khôi phục..." : "Khôi phục"}
        cancelLabel="Huỷ"
        loading={!!restoringId}
        onCancel={() => !restoringId && setRestoreTarget(null)}
        onConfirm={confirmRestore}
      />

      <ConfirmModal
        open={!!deleteTarget}
        tone="danger"
        icon="delete"
        title="Xóa vĩnh viễn tài liệu này?"
        description={
          <>
            Tài liệu <span className="font-semibold text-foreground">"{deleteTarget?.filename}"</span> sẽ bị xoá hoàn toàn khỏi hệ thống (cơ sở dữ liệu + file lưu trữ) và <span className="font-semibold text-red-400">không thể khôi phục</span>.
          </>
        }
        confirmLabel={deletingId ? "Đang xoá..." : "Xóa vĩnh viễn"}
        cancelLabel="Huỷ"
        loading={!!deletingId}
        onCancel={() => !deletingId && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
