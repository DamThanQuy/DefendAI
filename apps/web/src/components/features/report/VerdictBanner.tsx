import { CheckCircle2, Clock, Info, RotateCcw, ShieldAlert, UserX, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportDetail, VerdictCode } from "@/lib/api";

const TONE: Record<VerdictCode, { className: string; icon: typeof Info }> = {
  pass: { className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
  fail: { className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", icon: XCircle },
  banned: { className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", icon: ShieldAlert },
  redo: { className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", icon: RotateCcw },
  deferred: { className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", icon: Clock },
  fail_individual: { className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", icon: UserX },
  insufficient_data: { className: "border-border bg-muted/40 text-foreground", icon: Info },
};

/** Banner kết luận theo quy tắc qua/rớt SEP490 (§3.6) — luôn là dự báo từ buổi mock. */
export function VerdictBanner({ verdict }: { verdict: ReportDetail["verdict"] }) {
  const tone = TONE[verdict.code] ?? TONE.insufficient_data;
  const Icon = tone.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4", tone.className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">{verdict.label}</p>
        {verdict.reasons.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-sm">
            {verdict.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {!verdict.is_official && (
          <p className="pt-1 text-xs opacity-80">
            Kết luận này là dự báo từ buổi bảo vệ thử, không phải kết quả chính thức của hội đồng.
          </p>
        )}
      </div>
    </div>
  );
}
