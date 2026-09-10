"use client";

import React, { useEffect, useMemo, useRef } from "react";
import type { CodeIssue } from "@/types";

/** Màu nền theo severity cho dòng code có issue. */
function lineBg(sev: string): string {
  if (sev === "critical" || sev === "high") return "bg-red-500/10";
  if (sev === "medium") return "bg-orange-500/10";
  return "bg-yellow-500/10";
}

function markerColor(sev: string): string {
  if (sev === "critical" || sev === "high") return "text-red-400";
  if (sev === "medium") return "text-orange-400";
  return "text-yellow-400";
}

/**
 * Code preview GitHub-style: số dòng + đánh dấu ⚠️ ngay trên dòng có issue.
 * Click issue → scroll tới đúng dòng (nếu issue thuộc file này).
 */
export function CodePreview({
  content,
  path,
  issues,
  activeIssue,
  onPickIssue,
}: {
  content: string;
  path: string;
  issues: CodeIssue[];
  activeIssue: CodeIssue | null;
  onPickIssue: (issue: CodeIssue) => void;
}) {
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const lines = useMemo(() => content.split("\n"), [content]);

  const issueByLine = useMemo(() => {
    const m = new Map<number, CodeIssue[]>();
    for (const i of issues) {
      if (i.file !== path) continue;
      const arr = m.get(i.line) ?? [];
      arr.push(i);
      m.set(i.line, arr);
    }
    return m;
  }, [issues, path]);

  useEffect(() => {
    if (!activeIssue || activeIssue.file !== path) return;
    const el = lineRefs.current[activeIssue.line];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIssue, path]);

  return (
    <div className="flex-1 overflow-auto font-mono text-[13px] leading-[1.6] custom-scrollbar">
      {lines.map((line, idx) => {
        const n = idx + 1;
        const iss = issueByLine.get(n) ?? [];
        return (
          <div
            key={n}
            id={`line-${n}`}
            ref={(el) => { lineRefs.current[n] = el; }}
            className={`flex min-h-[26px] ${iss.length ? lineBg(iss[0].severity) : ""} hover:bg-muted/60 transition-colors`}
          >
            <div className="w-12 text-right pr-3 text-muted-foreground select-none shrink-0 border-r border-border/60">
              {n}
            </div>
            <div className="flex-1 whitespace-pre px-3 text-foreground">{line || " "}</div>
            {iss.length > 0 && (
              <div className="shrink-0 px-2 flex items-center gap-1">
                {iss.map((i, k) => (
                  <button
                    key={k}
                    title={`${i.type}: ${i.description}`}
                    onClick={() => onPickIssue(i)}
                    className={`text-[12px] hover:scale-125 transition-transform cursor-pointer ${markerColor(i.severity)}`}
                  >
                    ⚠️
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
