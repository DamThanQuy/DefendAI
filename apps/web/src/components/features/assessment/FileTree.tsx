"use client";

import React, { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";

interface Member {
  path: string;
  size: number;
  is_dir: boolean;
}

interface FileIssueStats {
  count: number;
  critical: number;
}

function issueBadgeCls(s: FileIssueStats): string {
  if (s.critical > 0) return "bg-red-500/10 text-red-400";
  if (s.count >= 3) return "bg-orange-500/10 text-orange-400";
  return "bg-green-500/10 text-green-400";
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Cây thư mục GitHub-style, tự quản lý expanded state. */
export function FileTree({
  members,
  selected,
  onSelect,
  fileStats,
}: {
  members: Member[];
  selected: string | null;
  onSelect: (path: string) => void;
  fileStats?: Map<string, FileIssueStats>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(() => {
    const root: { dirs: Map<string, any>; files: Member[] } = { dirs: new Map(), files: [] };
    for (const m of members) {
      const parts = m.path.split("/");
      if (m.is_dir) {
        let node = root;
        for (const p of parts) {
          if (!node.dirs.has(p)) node.dirs.set(p, { dirs: new Map(), files: [] });
          node = node.dirs.get(p);
        }
      } else {
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: [] });
          node = node.dirs.get(parts[i]);
        }
        node.files.push(m);
      }
    }
    return root;
  }, [members]);

  // Gộp số issue của mọi file con lên từng thư mục cha
  const dirStats = useMemo(() => {
    const m = new Map<string, FileIssueStats>();
    if (!fileStats) return m;
    for (const [path, s] of fileStats) {
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join("/");
        const cur = m.get(dir) ?? { count: 0, critical: 0 };
        cur.count += s.count;
        cur.critical += s.critical;
        m.set(dir, cur);
      }
    }
    return m;
  }, [fileStats]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const renderNode = (node: any, prefix: string): React.ReactNode => {
    const dirs = [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const files = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    return (
      <div>
        {dirs.map(([name, child]) => {
          const full = prefix ? `${prefix}/${name}` : name;
          const isOpen = expanded.has(full);
          const ds = dirStats.get(full);
          return (
            <div key={full}>
              <button
                onClick={() => toggleDir(full)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[13px] text-zinc-400 hover:bg-zinc-800/60 rounded-md text-left"
              >
                <ChevronRight
                  className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
                  strokeWidth={2.5}
                />
                <span>📁</span>
                <span className="font-medium truncate">{name}</span>
                {ds && ds.count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${issueBadgeCls(ds)} ${ds.critical > 0 ? "animate-pulse" : ""}`}>
                    {ds.count}
                  </span>
                )}
              </button>
              {isOpen && <div className="ml-4 border-l border-zinc-800 pl-1">{renderNode(child, full)}</div>}
            </div>
          );
        })}
        {files.map((f: Member) => {
          const name = f.path.split("/").pop();
          const isActive = selected === f.path;
          const fs = fileStats?.get(f.path);
          return (
            <button
              key={f.path}
              onClick={() => onSelect(f.path)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-[13px] rounded-md text-left ${
                isActive ? "bg-teal-500/10 text-teal-400 font-semibold" : "text-zinc-400 hover:bg-zinc-800/60"
              }`}
            >
              <span>{fileIcon(f.path)}</span>
              <span className="truncate flex-1">{name}</span>
              {fs && fs.count > 0 ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${issueBadgeCls(fs)} ${fs.critical > 0 ? "animate-pulse" : ""}`}>
                  {fs.count}
                </span>
              ) : (
                <span className="text-[10px] text-zinc-500 shrink-0">{formatSize(f.size)}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return <div>{renderNode(tree, "")}</div>;
}