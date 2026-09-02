"use client";

import React, { useEffect, useState } from "react";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"]);
const PDF_EXT = new Set([".pdf"]);
const DOCX_EXT = new Set([".docx", ".pptx", ".xlsx"]);

function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const icons: Record<string, string> = {
    py: "🐍", js: "🟨", ts: "🔷", tsx: "⚛️", jsx: "⚛️", java: "☕",
    go: "🐹", rb: "💎", php: "🐘", cs: "🟣", cpp: "➕", c: "➕",
    html: "🌐", css: "🎨", json: "🧾", yml: "⚙️", yaml: "⚙️",
    md: "📝", txt: "📄", pdf: "📕", docx: "📘", pptx: "📙", xlsx: "📗",
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", svg: "🖼️",
    zip: "🗜️", rar: "🗜️", sh: "🐚", sql: "🗄️", xml: "📄", toml: "⚙️",
  };
  return icons[ext] ?? "📄";
}

/** Preview 1 file trong archive: text / PDF / ảnh. */
export function FilePreview({ docId, path }: { docId: number; path: string }) {
  const [content, setContent] = useState<{ text: string; type: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent(null);
    setError("");
    const token = getToken();
    fetch(`/api/documents/${docId}/contents/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Không thể đọc file");
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        if (PDF_EXT.has(`.${ext}`) || DOCX_EXT.has(`.${ext}`) || IMAGE_EXT.has(`.${ext}`)) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          return { text: url, type: "binary" };
        }
        const text = await res.text();
        return { text, type: "text" };
      })
      .then((c) => { if (!cancelled) setContent(c); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [docId, path]);

  if (loading) return <div className="h-full flex items-center justify-center text-muted-foreground text-[14px]">Đang tải nội dung...</div>;
  if (error) return <div className="p-6 text-red-400 text-[14px]">{error}</div>;
  if (!content) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b border-border/60 bg-muted/40 flex items-center gap-2 text-[13px] text-muted-foreground">
        <span>{fileIcon(path)}</span>
        <span className="font-semibold">{path}</span>
      </div>
      {content.type === "text" ? (
        <pre className="p-4 text-[13px] leading-relaxed overflow-auto flex-1 font-mono text-foreground whitespace-pre">
          {content.text}
        </pre>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-card">
          {path.endsWith(".pdf") ? (
            <iframe src={content.text} className="w-full h-full" title={path} />
          ) : (
            <img src={content.text} alt={path} className="max-w-full max-h-full object-contain" />
          )}
        </div>
      )}
    </div>
  );
}