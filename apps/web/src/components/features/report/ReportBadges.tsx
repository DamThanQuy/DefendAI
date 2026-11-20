import { CheckCircle2, CircleHelp, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReportGenerationStatus, ReportStatus } from "@/lib/api";

const STATUS: Record<ReportStatus, { label: string; className: string }> = {
  completed: { label: "Hoàn thành", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  in_review: { label: "Đang xem xét", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  pending: { label: "Chờ xử lý", className: "bg-zinc-500/10 text-zinc-600 border-zinc-500/20" },
};

export function ReportStatusBadge({
  status,
  generationStatus,
}: {
  status: ReportStatus;
  generationStatus: ReportGenerationStatus;
}) {
  if (status === "pending" && generationStatus === "failed") {
    return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Lỗi tổng hợp</Badge>;
  }
  if (status === "pending" && generationStatus === "pending") {
    return (
      <Badge className={cn("gap-1", STATUS.pending.className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Đang tổng hợp
      </Badge>
    );
  }
  return <Badge className={STATUS[status].className}>{STATUS[status].label}</Badge>;
}

type Tone = "good" | "fair" | "poor" | "unknown";

const TONE: Record<Tone, { className: string; icon: typeof CheckCircle2 }> = {
  good: { className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  fair: { className: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: MinusCircle },
  poor: { className: "bg-red-500/10 text-red-600 border-red-500/20", icon: XCircle },
  unknown: { className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20", icon: CircleHelp },
};

// Mức lấy từ rubric (DB): phần tử đầu = tốt nhất, cuối = kém nhất.
function levelTone(level: string | null, levels?: string[]): Tone {
  if (!level) return "unknown";
  const scale = levels?.length ? levels : ["Đạt", "Khá", "Chưa đạt"];
  const index = scale.indexOf(level);
  if (index < 0) return "unknown";
  if (index === 0) return "good";
  return index === scale.length - 1 ? "poor" : "fair";
}

export function QualityLevelBadge({
  level,
  levels,
  label,
}: {
  level: string | null;
  levels?: string[];
  /** Tên tiêu chí — có thì badge hiện "Tiêu chí: Mức" (dùng trong danh sách). */
  label?: string;
}) {
  const tone = TONE[levelTone(level, levels)];
  const Icon = tone.icon;
  const text = level ?? "Chưa đủ căn cứ";
  return (
    <Badge className={cn("gap-1 font-medium", tone.className)}>
      <Icon className="h-3 w-3" />
      {label ? `${label}: ${text}` : text}
    </Badge>
  );
}
