"use client";

import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

const severityStyles: Record<string, string> = {
  error: "bg-red-500/10 text-red-400",
  warning: "bg-yellow-500/10 text-yellow-400",
  info: "bg-blue-500/10 text-blue-400",
};

const severityLabels: Record<string, string> = {
  error: "Lỗi",
  warning: "Cảnh báo",
  info: "Thông tin",
};

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "text-xs font-medium px-2 py-1 rounded-full",
        severityStyles[severity] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {severityLabels[severity] ?? severity}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Difficulty Badge
// ---------------------------------------------------------------------------

interface DifficultyBadgeProps {
  difficulty: string;
  className?: string;
}

const difficultyStyles: Record<string, string> = {
  easy: "bg-green-500/10 text-green-400",
  medium: "bg-yellow-500/10 text-yellow-400",
  hard: "bg-red-500/10 text-red-400",
};

const difficultyLabels: Record<string, string> = {
  easy: "Dễ",
  medium: "Trung bình",
  hard: "Khó",
};

export function DifficultyBadge({ difficulty, className }: DifficultyBadgeProps) {
  return (
    <span
      className={cn(
        "text-xs font-medium px-2 py-1 rounded-full",
        difficultyStyles[difficulty] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {difficultyLabels[difficulty] ?? difficulty}
    </span>
  );
}
