"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, Bot, ChevronRight, FileText, FolderOpen, Loader2, Search, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/features/report/MetricCard";
import { QualityLevelBadge, ReportStatusBadge } from "@/components/features/report/ReportBadges";
import { getMyReports, type MyReportsResponse, type ReportListItem, type ReportStatus } from "@/lib/api";
import { parseApiDate } from "@/lib/datetime";

type StatusFilter = "all" | ReportStatus;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Chờ xử lý" },
  { value: "in_review", label: "Đang xem xét" },
  { value: "completed", label: "Hoàn thành" },
];

const NO_WORKSPACE = "Chưa gắn đồ án";

function ReportCard({ report, scaleMax }: { report: ReportListItem; scaleMax: number }) {
  return (
    <Link href={`/report/${report.id}`} className="block">
      <Card className="border-border/50 transition-all hover:shadow-lg hover:shadow-primary/10">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <h3 className="truncate font-semibold text-foreground">{report.title}</h3>
                <ReportStatusBadge status={report.status} generationStatus={report.generation_status} />
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">{report.description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Bot className="h-3.5 w-3.5" />
                  {report.source === "ai_mock" ? "Mock AI" : "Mock với mentor"}
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
                {report.document_name && report.document_name !== report.title && (
                  <span className="truncate">Tài liệu: {report.document_name}</span>
                )}
                {report.final_score !== null && (
                  <span className="font-medium text-foreground">
                    Điểm mentor: {report.final_score}/{scaleMax}
                  </span>
                )}
              </div>
              {report.quality_criteria.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {report.quality_criteria.map((c) => (
                    <QualityLevelBadge key={c.key} level={c.level} label={c.label} />
                  ))}
                </div>
              )}
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ReportPage() {
  const [data, setData] = useState<MyReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");

  const load = useCallback(async (initial = false) => {
    if (initial) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await getMyReports();
      setData(res.data);
    } catch {
      if (initial) setError("Không tải được danh sách báo cáo. Vui lòng thử lại.");
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Còn báo cáo AI đang tổng hợp → tự tải lại cho tới khi xong
  const hasGenerating = data?.reports.some((r) => r.generation_status === "pending") ?? false;
  useEffect(() => {
    if (!hasGenerating) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [hasGenerating, load]);

  const groups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = (data?.reports ?? []).filter((r) => {
      const matchesSearch =
        !q ||
        [r.title, r.description, r.workspace_name, r.document_name].some((v) => v?.toLowerCase().includes(q));
      return matchesSearch && (filterStatus === "all" || r.status === filterStatus);
    });
    const byWorkspace = new Map<string, ReportListItem[]>();
    for (const r of filtered) {
      const key = r.workspace_name ?? NO_WORKSPACE;
      byWorkspace.set(key, [...(byWorkspace.get(key) ?? []), r]);
    }
    return Array.from(byWorkspace.entries());
  }, [data, searchQuery, filterStatus]);

  const summary = data?.summary;
  const scaleMax = summary?.scale_max ?? 10;
  const metrics = [
    { label: "Tổng báo cáo", value: String(summary?.total ?? 0) },
    { label: "Hoàn thành", value: String(summary?.completed ?? 0) },
    { label: "Đang xem xét", value: String(summary?.in_review ?? 0) },
    { label: "Chờ xử lý", value: String(summary?.pending ?? 0) },
    {
      label: "Điểm TB từ mentor",
      value: summary?.average_score != null ? `${summary.average_score}/${scaleMax}` : "—",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="border-b bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Báo cáo & Đánh giá</h1>
            <p className="mt-1 text-muted-foreground">
              Nhận xét sau các buổi bảo vệ thử theo tiêu chí chấm đồ án SEP490
            </p>
          </div>
          <Button asChild>
            <Link href="/mock-room-ai" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Luyện Mock AI
            </Link>
          </Button>
        </div>
      </div>

      <div className="container mx-auto space-y-6 px-4 py-8">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>

        <Card className="border-border/50 bg-background/50 backdrop-blur-sm">
          <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Tìm theo đồ án, tài liệu, nhận xét..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-background/50 py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={filterStatus === f.value ? "default" : "outline"}
                  onClick={() => setFilterStatus(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card className="border-red-500/30">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => void load(true)}>
                Thử lại
              </Button>
            </CardContent>
          </Card>
        ) : groups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground" />
              {data?.reports.length ? (
                <p className="text-muted-foreground">Không có báo cáo nào khớp bộ lọc.</p>
              ) : (
                <>
                  <p className="font-medium text-foreground">Chưa có báo cáo nào</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Luyện một buổi bảo vệ thử với Giám khảo AI, sau đó bấm “Kết thúc &amp; nhận báo cáo” để
                    nhận nhận xét theo tiêu chí chấm.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/mock-room-ai">Vào phòng Mock AI</Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          groups.map(([workspaceName, items]) => (
            <motion.section
              key={workspaceName}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <FolderOpen className="h-4 w-4" />
                {workspaceName}
                <span className="font-normal">({items.length})</span>
              </h2>
              {items.map((report) => (
                <ReportCard key={report.id} report={report} scaleMax={scaleMax} />
              ))}
            </motion.section>
          ))
        )}
      </div>
    </div>
  );
}
