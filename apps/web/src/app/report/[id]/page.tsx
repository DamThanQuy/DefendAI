"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isAxiosError } from "axios";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QualityLevelBadge, ReportStatusBadge } from "@/components/features/report/ReportBadges";
import { RubricRadarChart } from "@/components/features/report/RubricRadarChart";
import { ScoreGroupTable } from "@/components/features/report/ScoreGroupTable";
import { VerdictBanner } from "@/components/features/report/VerdictBanner";
import { MarkdownMessage } from "@/components/features/workspace/MarkdownMessage";
import { PlanLock } from "@/components/membership/PlanLock";
import { usePlanAccess } from "@/hooks/usePlanAccess";
import { getReportDetail, regenerateReport, type ReportDetail, type ReportRule } from "@/lib/api";
import { parseApiDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const RULE_STATUS: Record<ReportRule["auto_status"], { label: string; className: string }> = {
  pass: { label: "Đạt", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  violated: { label: "Vi phạm", className: "bg-red-500/10 text-red-600 border-red-500/20" },
  pending_data: { label: "Chưa có dữ liệu", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  na: { label: "Hội đồng xét", className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
};

function errorDetail(e: unknown, fallback: string): string {
  const detail = isAxiosError(e) ? e.response?.data?.detail : undefined;
  return typeof detail === "string" ? detail : fallback;
}

function ListCard({ title, icon, items, empty }: { title: string; icon: ReactNode; items: string[]; empty: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="list-disc space-y-1.5 pl-4 text-sm text-foreground">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ReportDetailPage() {
  const params = useParams();
  const reportId = Number(params.id);
  const { access } = usePlanAccess();

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(
    async (initial = false) => {
      try {
        const res = await getReportDetail(reportId);
        setReport(res.data);
      } catch (e) {
        if (!initial) return;
        const status = isAxiosError(e) ? e.response?.status : undefined;
        setError(
          status === 403
            ? "Bạn không có quyền xem báo cáo này."
            : status === 404
              ? "Báo cáo không tồn tại."
              : "Không tải được báo cáo. Vui lòng thử lại.",
        );
      } finally {
        if (initial) setLoading(false);
      }
    },
    [reportId],
  );

  useEffect(() => {
    if (!Number.isInteger(reportId) || reportId <= 0) {
      setError("Báo cáo không tồn tại.");
      setLoading(false);
      return;
    }
    void load(true);
  }, [reportId, load]);

  // AI đang tổng hợp → thăm dò lại cho tới khi xong
  const generating = report?.generation_status === "pending";
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [generating, load]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateReport(reportId);
      await load();
    } catch (e) {
      alert(errorDetail(e, "Không thể tạo lại nhận xét, vui lòng thử lại sau."));
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <h2 className="mb-2 text-xl font-bold text-foreground">Không thể mở báo cáo</h2>
          <p className="mb-4 text-muted-foreground">{error || "Báo cáo không tồn tại."}</p>
          <Link href="/report" className="font-semibold text-primary hover:underline">
            ← Về danh sách báo cáo
          </Link>
        </div>
      </div>
    );
  }

  const rubric = report.rubric;
  const scaleMax = rubric?.scale_max ?? 10;
  const criteriaCfg = Object.fromEntries((rubric?.quality_criteria ?? []).map((c) => [c.key, c]));
  const review = report.ai_review;
  const official = report.scores.official;
  const tdaScored = report.scores.items.TDA.filter((item) => item.mark !== null);
  const studentTurns = report.transcript.filter((t) => t.role === "student").length;

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto max-w-5xl space-y-6 px-4 pt-6 lg:px-8">
        <Link
          href="/report"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Báo cáo & Đánh giá
        </Link>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{report.title}</h1>
            <ReportStatusBadge status={report.status} generationStatus={report.generation_status} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Bot className="h-4 w-4" />
              {report.source === "ai_mock" ? "Bảo vệ thử với Giám khảo AI" : "Bảo vệ thử với mentor"}
            </span>
            <span>
              {parseApiDate(report.created_at).toLocaleString("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {report.workspace && <span>Đồ án: {report.workspace.name}</span>}
            {report.document && <span>Tài liệu: {report.document.filename}</span>}
            {rubric && (
              <span>
                Rubric: {rubric.name} (v{rubric.version})
              </span>
            )}
          </div>
        </div>

        {report.generation_status === "pending" && (
          <Card>
            <CardContent className="flex items-center gap-3 py-5">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
              <div>
                <p className="font-medium text-foreground">AI đang tổng hợp nhận xét theo tiêu chí chấm…</p>
                <p className="text-sm text-muted-foreground">Thường mất 1–2 phút, trang sẽ tự cập nhật.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {report.generation_status === "failed" && (
          <Card className="border-red-500/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="font-medium text-foreground">Chưa tạo được nhận xét AI</p>
                  {report.generation_error && (
                    <p className="text-sm text-muted-foreground">{report.generation_error}</p>
                  )}
                </div>
              </div>
              {report.can_regenerate && (
                <Button variant="outline" size="sm" className="gap-2" onClick={handleRegenerate} disabled={regenerating}>
                  {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Tạo lại nhận xét
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        <VerdictBanner verdict={report.verdict} />

        {review && (
          <>
            {review.overall_comment && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Nhận xét tổng quan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{review.overall_comment}</p>
                </CardContent>
              </Card>
            )}

            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Tiêu chí chất lượng</h2>
                <p className="text-sm text-muted-foreground">
                  AI không chấm điểm số, chỉ đánh giá theo mức của rubric dựa trên câu trả lời trong buổi.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {review.quality_criteria.map((c) => (
                  <Card key={c.key}>
                    <CardContent className="space-y-2 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-foreground">{c.label}</h3>
                        <QualityLevelBadge level={c.level} levels={criteriaCfg[c.key]?.levels} />
                      </div>
                      {criteriaCfg[c.key]?.description && (
                        <p className="text-xs text-muted-foreground">{criteriaCfg[c.key].description}</p>
                      )}
                      {c.comment && <p className="text-sm text-foreground">{c.comment}</p>}
                      {c.evidence && (
                        <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
                          {c.evidence}
                        </blockquote>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-3">
              <ListCard
                title="Điểm mạnh"
                icon={<ThumbsUp className="h-4 w-4 text-emerald-500" />}
                items={review.strengths}
                empty="Chưa ghi nhận điểm mạnh nổi bật."
              />
              <ListCard
                title="Điểm yếu"
                icon={<ThumbsDown className="h-4 w-4 text-red-500" />}
                items={review.weaknesses}
                empty="Không có điểm yếu đáng kể."
              />
              <ListCard
                title="Gợi ý cải thiện"
                icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
                items={review.action_items}
                empty="Không có gợi ý thêm."
              />
            </div>
          </>
        )}

        {rubric && (
          <PlanLock
            locked={!!report.rubric_locked}
            access={access}
            title="Đánh giá theo rubric chi tiết"
            description="Điểm từng hạng mục và biểu đồ chỉ dành cho gói Premium trở lên."
          >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Điểm theo rubric {rubric.name}</CardTitle>
              <CardDescription>
                Điểm do mentor/hội đồng chấm, thang {scaleMax}, đạt từ {rubric.pass_mark}. Buổi Mock AI không chấm
                điểm số.
                {official?.final != null && (
                  <>
                    {" "}
                    Điểm tổng: <strong className="text-foreground">{official.final}/{scaleMax}</strong>.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <Tabs defaultValue="TDA">
                <TabsList>
                  {rubric.groups.map((g) => (
                    <TabsTrigger key={g.group} value={g.group}>
                      {g.group} ({g.weight_pct}%)
                    </TabsTrigger>
                  ))}
                </TabsList>
                {rubric.groups.map((g) => (
                  <TabsContent key={g.group} value={g.group} className="mt-4">
                    <ScoreGroupTable
                      items={report.scores.items[g.group]}
                      result={official ? (g.group === "OGA" ? official.oga : official.tda) : null}
                      scaleMax={scaleMax}
                    />
                  </TabsContent>
                ))}
              </Tabs>
              <div className="mx-auto max-w-xl">
                <h3 className="mb-2 text-center text-sm font-medium text-foreground">
                  Điểm mentor theo hạng mục TDA
                </h3>
                {tdaScored.length >= 3 ? (
                  <RubricRadarChart
                    labels={tdaScored.map((item) => item.label)}
                    values={tdaScored.map((item) => item.mark as number)}
                    scaleMax={scaleMax}
                    seriesLabel="Điểm mentor (TDA)"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Biểu đồ radar hiển thị khi mentor/hội đồng đã chấm từ 3 hạng mục TDA trở lên.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </PlanLock>
        )}

        {review && review.clo_coverage.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Độ phủ CLO trong buổi chất vấn</CardTitle>
              <CardDescription>Chuẩn đầu ra nào đã được hỏi tới — phần chưa được hỏi nên tự ôn thêm.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {review.clo_coverage.map((c) => (
                  <li key={c.clo} className="flex gap-3">
                    {c.covered ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {c.clo} — {c.desc}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {c.covered ? "Đã đề cập" : "Chưa đề cập"}
                        </span>
                      </p>
                      {c.comment && <p className="text-sm text-muted-foreground">{c.comment}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quy tắc qua/rớt SEP490</CardTitle>
            <CardDescription>
              Hệ thống tự kiểm tra từ dữ liệu đồ án
              {report.rules.workspace_id ? "" : " (chưa xác định được đồ án nên nhiều quy tắc chưa có dữ liệu)"};
              các quy tắc còn lại do hội đồng xét.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {report.rules.rules.map((rule) => {
                const status = RULE_STATUS[rule.auto_status] ?? RULE_STATUS.na;
                const note = [
                  rule.input_summary !== "—" ? rule.input_summary : null,
                  rule.human_decision
                    ? `Hội đồng ${rule.human_decision === "confirm" ? "xác nhận" : "bác bỏ"}${
                        rule.human_reviewer ? ` (${rule.human_reviewer})` : ""
                      }`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={rule.rule_id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{rule.rule_name}</p>
                      {note && <p className="text-xs text-muted-foreground">{note}</p>}
                    </div>
                    <Badge className={status.className}>{status.label}</Badge>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {report.transcript.length > 0 && (
          <details className="group rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-sm font-medium text-foreground">
              Xem lại hội thoại ({report.transcript.length} lượt, {studentTurns} câu trả lời của bạn)
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-border p-5">
              {report.transcript.map((turn, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg p-3 text-sm",
                    turn.role === "student" ? "ml-8 bg-primary/5" : "mr-8 bg-muted/40",
                  )}
                >
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">
                    {turn.role === "student" ? "Sinh viên" : "Giám khảo AI"}
                    {turn.time && ` · ${turn.time}`}
                  </p>
                  {turn.role === "student" ? (
                    <p className="whitespace-pre-line text-foreground">{turn.content}</p>
                  ) : (
                    <MarkdownMessage content={turn.content} />
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
