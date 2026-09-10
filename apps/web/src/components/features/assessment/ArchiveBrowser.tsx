"use client";

import React, { useEffect, useState } from "react";
import { FileTree } from "@/components/features/assessment/FileTree";
import { FilePreview } from "@/components/features/assessment/FilePreview";

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

/** GitHub-style file browser: tree sidebar + preview pane. */
export function ArchiveBrowser({ docId, filename }: { docId: number; filename: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`/api/documents/${docId}/contents`, { headers: { Authorization: `Bearer ${token}` } })
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
  }, [docId]);

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60 bg-muted/40">
        <span className="text-xl">🗜️</span>
        <div>
          <div className="text-[14px] font-bold text-foreground">{filename}</div>
          <div className="text-[12px] text-muted-foreground">{members.length} file</div>
        </div>
      </div>

      {loading && (
        <div className="p-10 text-center text-muted-foreground text-[14px]">Đang tải nội dung file...</div>
      )}
      {error && !loading && (
        <div className="p-6 text-red-400 text-[14px]">{error}</div>
      )}

      {!loading && !error && (
        <div className="flex h-[600px]">
          {/* Sidebar tree */}
          <div className="w-72 border-r border-border/60 overflow-y-auto p-2 shrink-0">
            <FileTree members={members} selected={selected} onSelect={setSelected} />
          </div>

          {/* Preview pane */}
          <div className="flex-1 overflow-y-auto">
            {!selected && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <span className="text-4xl mb-3">👆</span>
                <p className="text-[14px]">Chọn một file để xem nội dung</p>
              </div>
            )}
            {selected && <FilePreview docId={docId} path={selected} />}
          </div>
        </div>
      )}
    </div>
  );
}