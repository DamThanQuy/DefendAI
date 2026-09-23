"use client";

import React, { useEffect, useState } from "react";
import { FileTree } from "@/components/features/assessment/FileTree";
import { FilePreview } from "@/components/features/assessment/FilePreview";
import {
  X,
  FileText,
  Calendar,
  HardDrive,
  Tag,
  Download,
  Trash2,
  FolderOpen,
  ChevronRight,
} from "lucide-react";

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

interface Member {
  path: string;
  size: number;
  is_dir: boolean;
}

interface ContentsResponse {
  document_id: number;
  filename: string;
  total: number;
  items: Member[];
}

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const docTypeLabel: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  zip: "ZIP",
  rar: "RAR",
};

const statusLabel: Record<string, { text: string; color: string }> = {
  uploaded: { text: "Đã tải lên", color: "text-emerald-400 bg-emerald-500/10" },
  processing: { text: "Đang xử lý", color: "text-amber-400 bg-amber-500/10" },
  completed: { text: "Hoàn thành", color: "text-teal-400 bg-teal-500/10" },
  failed: { text: "Thất bại", color: "text-red-400 bg-red-500/10" },
};

interface DocumentDetailSidebarProps {
  doc: DocumentItem | null;
  onClose: () => void;
  onDelete?: (doc: DocumentItem) => void;
}

export function DocumentDetailSidebar({ doc, onClose, onDelete }: DocumentDetailSidebarProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const isArchive = doc?.doc_type === "zip" || doc?.doc_type === "rar";

  useEffect(() => {
    if (!doc) {
      setMembers([]);
      setSelected(null);
      setShowArchive(false);
      return;
    }

    // Reset state when doc changes
    setSelected(null);
    setShowArchive(false);

    if (isArchive) {
      setLoading(true);
      setError("");
      const token = getToken();
      if (!token) return;
      fetch(`/api/documents/${doc.id}/contents`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error("Không thể tải nội dung file");
          return r.json();
        })
        .then((data: ContentsResponse) => {
          setMembers(data.items ?? []);
          setError("");
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [doc?.id, isArchive]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (!doc) return null;

  const status = statusLabel[doc.status] ?? { text: doc.status, color: "text-zinc-400 bg-zinc-800" };
  const typeLabel = doc.file_type === ".rar" ? "RAR" : docTypeLabel[doc.doc_type] ?? doc.file_type;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Sidebar panel */}
      <aside
        className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-[90vw] bg-card/95 backdrop-blur-xl border-l border-border shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-teal-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-foreground truncate">
                {doc.filename}
              </h2>
              <p className="text-[12px] text-muted-foreground">Chi tiết tài liệu</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Info section */}
          <div className="p-5 space-y-4">
            {/* File type & status badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-bold text-zinc-300 bg-zinc-800 px-2.5 py-1 rounded-lg">
                {typeLabel}
              </span>
              <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg ${status.color}`}>
                {status.text}
              </span>
              {doc.purpose && (
                <span className="text-[12px] font-medium text-zinc-400 bg-zinc-800/60 px-2.5 py-1 rounded-lg">
                  {doc.purpose}
                </span>
              )}
            </div>

            {/* Detail rows */}
            <div className="space-y-3 rounded-xl bg-muted/30 border border-border/40 p-4">
              <DetailRow
                icon={<Calendar className="w-4 h-4" />}
                label="Ngày tải lên"
                value={formatDate(doc.created_at)}
              />
              <DetailRow
                icon={<HardDrive className="w-4 h-4" />}
                label="Loại file"
                value={typeLabel}
              />
              <DetailRow
                icon={<HardDrive className="w-4 h-4" />}
                label="Dung lượng"
                value={formatFileSize(doc.size)}
              />
              <DetailRow
                icon={<Tag className="w-4 h-4" />}
                label="ID tài liệu"
                value={`#${doc.id}`}
              />
              {isArchive && (
                <DetailRow
                  icon={<FolderOpen className="w-4 h-4" />}
                  label="Số file trong archive"
                  value={loading ? "..." : `${members.length} file`}
                />
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <a
                href={`/api/documents/${doc.id}/download`}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-foreground bg-muted/60 rounded-xl hover:bg-muted border border-border/60 transition-colors"
              >
                <Download className="w-4 h-4" />
                Tải xuống
              </a>
              {onDelete && (
                <button
                  onClick={() => onDelete(doc)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold text-red-400 bg-red-500/10 rounded-xl hover:bg-red-500/20 border border-red-500/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Xoá
                </button>
              )}
            </div>
          </div>

          {/* Archive browser section */}
          {isArchive && (
            <div className="border-t border-border">
              <button
                onClick={() => setShowArchive(!showArchive)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-teal-400" />
                  <span className="text-[14px] font-semibold text-foreground">
                    Xem nội dung archive
                  </span>
                  {!loading && (
                    <span className="text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {members.length}
                    </span>
                  )}
                </div>
                <ChevronRight
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    showArchive ? "rotate-90" : ""
                  }`}
                />
              </button>

              {showArchive && (
                <div className="border-t border-border/40">
                  {loading && (
                    <div className="p-8 text-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-[13px] text-muted-foreground">Đang tải nội dung...</p>
                    </div>
                  )}
                  {error && (
                    <div className="p-5 text-red-400 text-[13px]">{error}</div>
                  )}
                  {!loading && !error && (
                    <div className="flex h-[500px]">
                      {/* File tree */}
                      <div className="w-60 border-r border-border/40 overflow-y-auto p-2 shrink-0">
                        <FileTree
                          members={members}
                          selected={selected}
                          onSelect={setSelected}
                        />
                      </div>
                      {/* Preview */}
                      <div className="flex-1 overflow-y-auto">
                        {!selected && (
                          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                            <FolderOpen className="w-10 h-10 mb-3 opacity-40" />
                            <p className="text-[13px]">Chọn một file để xem nội dung</p>
                          </div>
                        )}
                        {selected && <FilePreview docId={doc.id} path={selected} />}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Animation styles */}
      <style jsx global>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s ease-out;
        }
      `}</style>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <span className="text-[13px] font-semibold text-foreground">{value}</span>
    </div>
  );
}
