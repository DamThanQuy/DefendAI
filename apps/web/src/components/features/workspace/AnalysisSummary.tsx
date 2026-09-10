"use client";

import { RequirementMatchesResponse } from "@/types";
import { Card, CardContent, CardDescription } from "@/components/ui/card";

interface AnalysisSummaryProps {
  matches: RequirementMatchesResponse;
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

export function AnalysisSummary({ matches }: AnalysisSummaryProps) {
  const { total, matched, partial, not_found, insufficient_evidence } = matches;
  const conf = total === 0 ? 0
    : Math.round(((matched * 1.0 + partial * 0.6) / total) * 100);

  const cards = [
    {
      label: "Khớp đầy đủ",
      value: `${matched}/${total}`,
      sub: `${pct(matched, total)}%`,
      accent: "text-green-400",
      dot: "bg-green-500",
      border: "border-green-500/30",
      bg: "bg-green-500/5",
    },
    {
      label: "Khớp một phần",
      value: `${partial}/${total}`,
      sub: `${pct(partial, total)}%`,
      accent: "text-amber-400",
      dot: "bg-amber-500",
      border: "border-amber-500/30",
      bg: "bg-amber-500/5",
    },
    {
      label: "Không tìm thấy",
      value: `${not_found}/${total}`,
      sub: `${pct(not_found, total)}%`,
      accent: "text-red-400",
      dot: "bg-red-500",
      border: "border-red-500/30",
      bg: "bg-red-500/5",
    },
    {
      label: "Thiếu bằng chứng",
      value: `${insufficient_evidence}/${total}`,
      sub: `${pct(insufficient_evidence, total)}%`,
      accent: "text-muted-foreground",
      dot: "bg-muted",
      border: "border-border",
      bg: "bg-muted/30",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Overall confidence */}
      <div className="flex items-center justify-center gap-2 px-1">
        <span className="text-sm text-muted-foreground">Độ tin cậy tổng thể:</span>
        <span className="text-sm font-semibold text-foreground">{conf}%</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className={`${c.border} ${c.bg}`}>
            <CardContent className="p-4 h-full flex flex-col items-center text-center gap-1">
              <CardDescription className="text-xs w-full min-h-12 flex items-center justify-center gap-1.5 text-center leading-4">
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                {c.label}
              </CardDescription>
              <p className={`text-2xl font-bold ${c.accent}`}>{c.value}</p>
              <p className={`text-xs ${c.accent} opacity-70`}>{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
