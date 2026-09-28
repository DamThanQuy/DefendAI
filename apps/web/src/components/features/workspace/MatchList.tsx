"use client";

import { useState } from "react";
import { RequirementMatchOut, MatchStatus } from "@/types";
import { Button } from "@/components/ui/button";

interface MatchListProps {
  matches: RequirementMatchOut[];
}

const STATUS_CONFIG: Record<MatchStatus, { label: string; badge: string; color: string }> = {
  matched: { label: "Khớp đầy đủ", badge: "bg-green-500/10 text-green-400 border-green-500/30", color: "text-green-400" },
  partial: { label: "Khớp một phần", badge: "bg-amber-500/10 text-amber-400 border-amber-500/30", color: "text-amber-400" },
  not_found: { label: "Không tìm thấy", badge: "bg-red-500/10 text-red-400 border-red-500/30", color: "text-red-400" },
  insufficient_evidence: { label: "Thiếu bằng chứng", badge: "bg-muted/30 text-muted-foreground border-border", color: "text-muted-foreground" },
};

const FILTERS = ["all", "matched", "partial", "not_found", "insufficient_evidence"] as const;
type Filter = (typeof FILTERS)[number];

export function MatchList({ matches }: MatchListProps) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const filtered = activeFilter === "all"
    ? matches
    : matches.filter((m) => m.status === activeFilter);

  const toggle = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch(() => {});
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap justify-center gap-2">
        {FILTERS.map((f) => {
          const count = f === "all" ? matches.length : matches.filter((m) => m.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`
                text-xs font-medium px-3 py-1.5 rounded-full border transition-all
                ${activeFilter === f
                  ? "bg-teal-500/10 text-teal-400 border-teal-500/30"
                  : "bg-transparent text-muted-foreground border-border hover:border-teal-500/30 hover:text-teal-400"
                }
              `}
            >
              {f === "all" ? "Tất cả" : f === "insufficient_evidence" ? "Thiếu bằng chứng" : f === "not_found" ? "Không tìm thấy" : f === "matched" ? "Khớp đầy đủ" : "Khớp một phần"}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Match rows */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Không có requirement nào trong danh mục này.
          </p>
        )}
        {filtered.map((match) => {
          const cfg = STATUS_CONFIG[match.status];
          const isExpanded = expandedIds.has(match.id);
          const isAiReviewed = match.reason_provider != null;
          const isFallback = match.reason_fallback === "true";

          return (
            <div
              key={match.id}
              className="border border-border rounded-xl overflow-hidden bg-card"
            >
              {/* Row header */}
              <button
                onClick={() => toggle(match.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              >
                {/* Status dot */}
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${cfg.color.replace("text-", "bg-")}`} />

                {/* Code + title */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {match.requirement_code} · {match.requirement_title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Confidence */}
                    <span className="text-xs text-muted-foreground">
                      {match.confidence}%
                    </span>
                    {/* AI badge */}
                    {isAiReviewed ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                        🤖 AI đã đánh giá
                        {isFallback ? " (dự phòng)" : ""}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border">
                        ⚙️ Chỉ heuristic
                      </span>
                    )}
                    {/* Model tooltip on hover */}
                    {isAiReviewed && match.reason_model && (
                      <span className="text-xs text-muted-foreground truncate">
                        ({match.reason_model})
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${cfg.badge}`}>
                  {cfg.label}
                </span>

                {/* Expand chevron */}
                <span className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                  ▼
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-border/50">
                  {/* Reason (Step 4) */}
                  {match.reason && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lý do</p>
                      <p className={`text-sm ${isFallback ? "italic text-muted-foreground" : "text-foreground"}`}>
                        {match.reason}
                      </p>
                    </div>
                  )}

                  {/* Evidence */}
                  {match.evidence.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bằng chứng</p>
                      {match.evidence.map((ev, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-0.5">•</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground font-mono text-xs">
                              {ev.path}
                              {ev.symbol_name && <> :: {ev.symbol_name}</>}
                              {ev.line_start && <> (L{ev.line_start}{ev.line_end ? `–${ev.line_end}` : ""})</>}
                            </p>
                            {ev.snippet && (
                              <pre className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
                                {ev.snippet.slice(0, 200)}
                                {ev.snippet.length > 200 && "…"}
                              </pre>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyPath(ev.path); }}
                            className="text-xs text-muted-foreground hover:text-teal-400 shrink-0 mt-0.5"
                            title="Copy path"
                          >
                            📋
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Missing evidence */}
                  {match.missing_evidence.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Còn thiếu</p>
                      <div className="flex flex-wrap gap-1.5">
                        {match.missing_evidence.map((kw, i) => (
                          <span
                            key={i}
                            className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}