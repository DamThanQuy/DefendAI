"use client";

import React, { useMemo, useState } from "react";

interface Member {
  path: string;
  size: number;
  is_dir: boolean;
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
}: {
  members: Member[];
  selected: string | null;
  onSelect: (path: string) => void;
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
          return (
            <div key={full}>
              <button
                onClick={() => toggleDir(full)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-[13px] text-gray-700 hover:bg-gray-100 rounded-md text-left"
              >
                <span className={`text-[10px] text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                <span>📁</span>
                <span className="font-medium truncate">{name}</span>
              </button>
              {isOpen && <div className="ml-4 border-l border-gray-100 pl-1">{renderNode(child, full)}</div>}
            </div>
          );
        })}
        {files.map((f: Member) => {
          const name = f.path.split("/").pop();
          const isActive = selected === f.path;
          return (
            <button
              key={f.path}
              onClick={() => onSelect(f.path)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-[13px] rounded-md text-left ${
                isActive ? "bg-blue-50 text-[#0f2e82] font-semibold" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span>{fileIcon(f.path)}</span>
              <span className="truncate flex-1">{name}</span>
              <span className="text-[10px] text-gray-400">{formatSize(f.size)}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return <div>{renderNode(tree, "")}</div>;
}