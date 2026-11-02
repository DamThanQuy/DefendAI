"use client";

import React, { useEffect, useState, useMemo } from "react";
import { parseApiDate } from "@/lib/datetime";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Star,
  TrendingUp,
  Smile,
  Frown,
  Meh,
  Users,
  CreditCard,
  Filter,
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  FileSearch,
  CalendarClock,
  MonitorPlay,
  FileBarChart,
  Crown,
  Heart,
  Lightbulb,
  X,
  ChevronDown,
} from "lucide-react";

interface CSATStats {
  average_score: number;
  total_responses: number;
  satisfied_count: number;
  satisfied_percentage: number;
  rating_distribution: Record<string, number>;
  common_low_rating_reasons: Array<{ reason: string; count: number }>;
}

interface NPSStats {
  score: number;
  promoters_count: number;
  passives_count: number;
  detractors_count: number;
  promoters_percentage: number;
  passives_percentage: number;
  detractors_percentage: number;
  total_nps_responses: number;
  distribution: Record<string, number>;
}

interface AdoptionFunnelStats {
  registered_users: number;
  workspaces_users: number;
  analysis_users: number;
  bookings_users: number;
  meetings_users: number;
  reports_users: number;
  feedback_users: number;
  funnel_percentages: {
    workspaces: number;
    analysis: number;
    bookings: number;
    meetings: number;
    reports: number;
    feedbacks: number;
  };
}

interface WillingnessToPayStats {
  distribution: Record<string, number>;
  paid_count: number;
  free_count: number;
  paid_percentage: number;
  total_responses: number;
}

interface FeedbackStats {
  csat: CSATStats;
  nps: NPSStats;
  adoption_funnel: AdoptionFunnelStats;
  willingness_to_pay: WillingnessToPayStats;
}

interface FeedbackItem {
  id: number;
  user_id: number;
  user_email?: string | null;
  user_name?: string | null;
  current_plan: string;
  overall_rating: number;
  aspect_ratings?: Record<string, any> | null;
  detected_features?: string[] | null;
  feature_ratings?: Record<string, any> | null;
  low_rating_reasons?: string[] | null;
  best_thing?: string | null;
  suggested_change?: string | null;
  will_recommend?: number | null;
  pay_willingness?: string | null;
  created_at: string;
}

export default function AdminFeedbacksPage() {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterPlan, setFilterPlan] = useState<string>("all");
  const [filterRating, setFilterRating] = useState<string>("all");

  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [statsRes, listRes] = await Promise.all([
        api.get<FeedbackStats>("/api/feedback/stats"),
        api.get<{ items: FeedbackItem[]; total: number }>("/api/feedback?limit=100"),
      ]);

      setStats(statsRes.data);
      setFeedbacks(listRes.data?.items || []);
    } catch (err) {
      console.error("Lỗi khi tải dữ liệu feedback admin:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Tính phân bổ gói tài khoản từ danh sách phản hồi
  const planDistribution = useMemo(() => {
    const counts: Record<string, number> = {
      free: 0,
      starter: 0,
      pro: 0,
      vip: 0,
    };
    feedbacks.forEach((fb) => {
      const plan = (fb.current_plan || "free").toLowerCase();
      if (counts[plan] !== undefined) {
        counts[plan] += 1;
      } else {
        counts[plan] = (counts[plan] || 0) + 1;
      }
    });
    return counts;
  }, [feedbacks]);

  // Lọc danh sách phản hồi
  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((fb) => {
      const matchesSearch =
        !searchQuery ||
        fb.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fb.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fb.best_thing?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fb.suggested_change?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPlan =
        filterPlan === "all" ||
        (fb.current_plan || "free").toLowerCase() === filterPlan.toLowerCase();

      const matchesRating =
        filterRating === "all" ||
        fb.overall_rating.toString() === filterRating;

      return matchesSearch && matchesPlan && matchesRating;
    });
  }, [feedbacks, searchQuery, filterPlan, filterRating]);

  // Format ngày tháng
  function formatDate(iso: string) {
    if (!iso) return "—";
    try {
      const d = parseApiDate(iso);
      return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  // Format tên tính năng
  function formatFeatureName(key: string) {
    const map: Record<string, string> = {
      workspaces: "Workspace (Đề tài & Chat)",
      analysis: "Code Review & Phân tích",
      bookings: "Đặt lịch Mentor",
      meetings: "Phòng Mock Room",
      reports: "Báo cáo Đánh giá",
    };
    return map[key] || key;
  }

  // Format nhãn tiêu chí đánh giá cho người đọc dễ hiểu
  function formatAspectLabel(key: string) {
    const map: Record<string, string> = {
      ui_ux: "Giao diện & Trải nghiệm (UI/UX)",
      ai_quality: "Chất lượng phản biện của AI",
      performance: "Tốc độ xử lý & Phản hồi",
      rubric_alignment: "Bám sát barem chấm hội đồng",
      practical_value: "Giá trị thực tế & Tự tin",
      csat_10: "Mức độ hài lòng chung (CSAT)",
    };
    return map[key] || key;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
        <p className="text-sm text-muted-foreground">Đang tổng hợp báo cáo phản hồi người dùng...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground">
            Phản hồi & Khảo sát Người dùng
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Theo dõi chỉ số hài lòng CSAT, NPS, phễu chuyển đổi tính năng và góp ý của sinh viên.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="gap-2 self-start md:self-auto border-border text-foreground hover:bg-muted"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-teal-400" : ""}`} />
          <span>Làm mới số liệu</span>
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* CSAT Card */}
        <Card className="bg-gradient-to-br from-card to-teal-500/5 border-teal-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-teal-400">
                Chỉ số CSAT
              </CardDescription>
              <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
                <Smile className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold flex items-baseline gap-1 pt-1">
              <span>{stats?.csat.average_score ?? 0}</span>
              <span className="text-sm font-normal text-muted-foreground">/ 5.0</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-teal-400">
                {stats?.csat.satisfied_percentage ?? 0}%
              </span>{" "}
              hài lòng ({stats?.csat.satisfied_count ?? 0}/{stats?.csat.total_responses ?? 0} lượt)
            </p>
          </CardContent>
        </Card>

        {/* NPS Card */}
        <Card className="bg-gradient-to-br from-card to-cyan-500/5 border-cyan-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Điểm NPS (Net Promoter)
              </CardDescription>
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold pt-1">
              {stats?.nps.score !== undefined
                ? (stats.nps.score > 0 ? `+${stats.nps.score}` : `${stats.nps.score}`)
                : "0"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              <span className="text-teal-400 font-semibold">{stats?.nps.promoters_percentage ?? 0}%</span> Promoters ·{" "}
              <span className="text-amber-400">{stats?.nps.passives_percentage ?? 0}%</span> Passives ·{" "}
              <span className="text-rose-400">{stats?.nps.detractors_percentage ?? 0}%</span> Detractors
            </p>
          </CardContent>
        </Card>

        {/* Sẵn sàng trả phí */}
        <Card className="bg-gradient-to-br from-card to-purple-500/5 border-purple-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                Sẵn sàng chi trả
              </CardDescription>
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold pt-1">
              {stats?.willingness_to_pay.paid_percentage ?? 0}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {stats?.willingness_to_pay.paid_count ?? 0} người dùng sẵn sàng mua gói trả phí
            </p>
          </CardContent>
        </Card>

        {/* Tổng phản hồi */}
        <Card className="bg-gradient-to-br from-card to-amber-500/5 border-amber-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Tổng phản hồi
              </CardDescription>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold pt-1">
              {feedbacks.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Trên tổng số {stats?.adoption_funnel.registered_users ?? 0} tài khoản đăng ký
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Biểu đồ Phân bổ CSAT & Phân bổ Gói tài khoản */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Phân bổ đánh giá sao CSAT */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              Phân bổ xếp hạng sao (CSAT 1 - 5 sao)
            </CardTitle>
            <CardDescription className="text-xs">
              Tỷ lệ phân bổ điểm số mức độ hài lòng của sinh viên
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = stats?.csat.rating_distribution[stars.toString()] || 0;
              const total = stats?.csat.total_responses || 1;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;

              return (
                <div key={stars} className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1 w-16 shrink-0 font-medium">
                    <span>{stars} sao</span>
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  </div>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        stars >= 4
                          ? "bg-gradient-to-r from-teal-500 to-emerald-400"
                          : stars === 3
                          ? "bg-amber-400"
                          : "bg-rose-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-16 text-right shrink-0 text-muted-foreground">
                    <span className="font-semibold text-foreground">{count}</span> ({pct}%)
                  </div>
                </div>
              );
            })}

            {/* Lý do thường gặp khi <= 3 sao */}
            {stats?.csat.common_low_rating_reasons && stats.csat.common_low_rating_reasons.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Các nguyên nhân đánh giá thấp cần khắc phục:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stats.csat.common_low_rating_reasons.map((r, i) => (
                    <Badge
                      key={i}
                      className="text-[11px] bg-amber-500/10 border-amber-500/20 text-amber-300 py-0.5"
                    >
                      {r.reason} ({r.count})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Phân bổ gói tài khoản (Plan Distribution) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Crown className="w-4 h-4 text-purple-400" />
              Phân bổ gói tài khoản của người phản hồi
            </CardTitle>
            <CardDescription className="text-xs">
              Tỷ trọng phản hồi đến từ nhóm người dùng theo từng gói dịch vụ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { plan: "free", label: "Gói Free", color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" },
                { plan: "starter", label: "Gói Starter", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
                { plan: "pro", label: "Gói Pro", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
                { plan: "vip", label: "Gói VIP", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
              ].map((item) => {
                const count = planDistribution[item.plan] || 0;
                const total = feedbacks.length || 1;
                const pct = Math.round((count / total) * 100);

                return (
                  <div
                    key={item.plan}
                    className={`p-3.5 rounded-xl border ${item.color} flex flex-col justify-between`}
                  >
                    <span className="text-xs font-semibold">{item.label}</span>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="text-2xl font-bold">{count}</span>
                      <span className="text-xs opacity-80">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Thanh biểu đồ ngang phân bổ gói */}
            <div className="w-full h-3 rounded-full overflow-hidden flex bg-muted">
              {feedbacks.length > 0 && (
                <>
                  <div
                    style={{ width: `${(planDistribution.free / feedbacks.length) * 100}%` }}
                    className="bg-zinc-500 h-full"
                    title={`Free: ${planDistribution.free}`}
                  />
                  <div
                    style={{ width: `${(planDistribution.starter / feedbacks.length) * 100}%` }}
                    className="bg-blue-500 h-full"
                    title={`Starter: ${planDistribution.starter}`}
                  />
                  <div
                    style={{ width: `${(planDistribution.pro / feedbacks.length) * 100}%` }}
                    className="bg-purple-500 h-full"
                    title={`Pro: ${planDistribution.pro}`}
                  />
                  <div
                    style={{ width: `${(planDistribution.vip / feedbacks.length) * 100}%` }}
                    className="bg-amber-500 h-full"
                    title={`VIP: ${planDistribution.vip}`}
                  />
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Phễu tính năng (Adoption Funnel) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                Phễu chuyển đổi tính năng (Feature Adoption Funnel)
              </CardTitle>
              <CardDescription className="text-xs">
                Mức độ thâm nhập của người dùng qua từng tính năng cốt lõi trên toàn hệ thống
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">
              Tổng user: <strong className="text-foreground">{stats?.adoption_funnel.registered_users ?? 0}</strong>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              {
                name: "Workspaces",
                count: stats?.adoption_funnel.workspaces_users ?? 0,
                pct: stats?.adoption_funnel.funnel_percentages.workspaces ?? 0,
                icon: FolderKanban,
                color: "text-blue-400 bg-blue-500/10",
              },
              {
                name: "Phân tích đồ án",
                count: stats?.adoption_funnel.analysis_users ?? 0,
                pct: stats?.adoption_funnel.funnel_percentages.analysis ?? 0,
                icon: FileSearch,
                color: "text-cyan-400 bg-cyan-500/10",
              },
              {
                name: "Đặt lịch Mentor",
                count: stats?.adoption_funnel.bookings_users ?? 0,
                pct: stats?.adoption_funnel.funnel_percentages.bookings ?? 0,
                icon: CalendarClock,
                color: "text-teal-400 bg-teal-500/10",
              },
              {
                name: "Mock Room",
                count: stats?.adoption_funnel.meetings_users ?? 0,
                pct: stats?.adoption_funnel.funnel_percentages.meetings ?? 0,
                icon: MonitorPlay,
                color: "text-emerald-400 bg-emerald-500/10",
              },
              {
                name: "Xem Báo cáo",
                count: stats?.adoption_funnel.reports_users ?? 0,
                pct: stats?.adoption_funnel.funnel_percentages.reports ?? 0,
                icon: FileBarChart,
                color: "text-amber-400 bg-amber-500/10",
              },
              {
                name: "Gửi Phản hồi",
                count: stats?.adoption_funnel.feedback_users ?? 0,
                pct: stats?.adoption_funnel.funnel_percentages.feedbacks ?? 0,
                icon: Heart,
                color: "text-rose-400 bg-rose-500/10",
              },
            ].map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.name}
                  className="p-3.5 bg-card border border-border/70 rounded-xl flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      BƯỚC {idx + 1}
                    </span>
                    <div className={`p-1.5 rounded-lg ${step.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground truncate">
                      {step.name}
                    </div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-lg font-bold">{step.count}</span>
                      <span className="text-xs font-semibold text-teal-400">{step.pct}%</span>
                    </div>
                  </div>
                  {/* Thanh tiến trình */}
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full"
                      style={{ width: `${Math.min(100, step.pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Row 4: Danh sách Feedback (Bảng chi tiết) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-semibold">
                Danh sách chi tiết phản hồi ({filteredFeedbacks.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Xem toàn bộ ý kiến đánh giá, lời khen và đề xuất nâng cấp của từng sinh viên
              </CardDescription>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative w-48 sm:w-60">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Tìm email, lời khen, góp ý..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-muted/30"
                />
              </div>

              {/* Filter Plan */}
              <select
                value={filterPlan}
                onChange={(e) => setFilterPlan(e.target.value)}
                className="h-8 px-2.5 text-xs bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none"
              >
                <option value="all">Tất cả gói</option>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="vip">VIP</option>
              </select>

              {/* Filter Rating */}
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="h-8 px-2.5 text-xs bg-muted/40 border border-border rounded-lg text-foreground focus:outline-none"
              >
                <option value="all">Tất cả sao</option>
                <option value="5">5 sao</option>
                <option value="4">4 sao</option>
                <option value="3">3 sao</option>
                <option value="2">2 sao</option>
                <option value="1">1 sao</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredFeedbacks.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Không tìm thấy phản hồi nào phù hợp với bộ lọc.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground font-medium">
                    <th className="py-3 px-3">Người dùng</th>
                    <th className="py-3 px-2">Gói</th>
                    <th className="py-3 px-2">Đánh giá chung</th>
                    <th className="py-3 px-2">NPS</th>
                    <th className="py-3 px-3">Tính năng đã dùng</th>
                    <th className="py-3 px-3">Lời khen / Góp ý</th>
                    <th className="py-3 px-3">Ngày gửi</th>
                    <th className="py-3 px-2 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredFeedbacks.map((fb) => (
                    <tr key={fb.id} className="hover:bg-muted/30 transition-colors">
                      {/* Người dùng */}
                      <td className="py-3 px-3 font-medium">
                        <div className="text-foreground">{fb.user_name || "Sinh viên"}</div>
                        <div className="text-muted-foreground text-[11px] truncate max-w-[150px]">
                          {fb.user_email || `User #${fb.user_id}`}
                        </div>
                      </td>

                      {/* Gói */}
                      <td className="py-3 px-2">
                        <Badge
                          className={`text-[10px] uppercase font-bold px-1.5 py-0 ${
                            fb.current_plan === "vip"
                              ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                              : fb.current_plan === "pro"
                              ? "border-purple-500/40 text-purple-400 bg-purple-500/10"
                              : fb.current_plan === "starter"
                              ? "border-blue-500/40 text-blue-400 bg-blue-500/10"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {fb.current_plan || "free"}
                        </Badge>
                      </td>

                      {/* Sao chung */}
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1 font-semibold text-foreground">
                          <span>{fb.overall_rating}</span>
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        </div>
                      </td>

                      {/* NPS */}
                      <td className="py-3 px-2">
                        {fb.will_recommend !== null && fb.will_recommend !== undefined ? (
                          <span
                            className={`font-semibold ${
                              fb.will_recommend >= 9
                                ? "text-teal-400"
                                : fb.will_recommend >= 7
                                ? "text-blue-400"
                                : "text-rose-400"
                            }`}
                          >
                            {fb.will_recommend}/10
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Tính năng đã dùng */}
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {fb.detected_features && fb.detected_features.length > 0 ? (
                            fb.detected_features.map((feat) => (
                              <span
                                key={feat}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                              >
                                {formatFeatureName(feat)}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>

                      {/* Lời khen / Góp ý */}
                      <td className="py-3 px-3 max-w-[240px]">
                        {fb.best_thing && (
                          <p className="text-[11px] text-teal-300 truncate" title={fb.best_thing}>
                            <strong className="text-teal-400">Khen:</strong> {fb.best_thing}
                          </p>
                        )}
                        {fb.suggested_change && (
                          <p className="text-[11px] text-amber-300 truncate" title={fb.suggested_change}>
                            <strong className="text-amber-400">Góp ý:</strong> {fb.suggested_change}
                          </p>
                        )}
                        {!fb.best_thing && !fb.suggested_change && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Ngày gửi */}
                      <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(fb.created_at)}
                      </td>

                      {/* Nút Xem chi tiết */}
                      <td className="py-3 px-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedFeedback(fb)}
                          className="h-7 px-2 text-xs text-teal-400 hover:text-teal-300 hover:bg-teal-500/10"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          Xem
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Chi Tiết Feedback */}
      {selectedFeedback && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
              <div>
                <h3 className="text-base font-serif font-bold text-foreground">
                  Chi tiết Phản hồi #{selectedFeedback.id}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Từ {selectedFeedback.user_name || "Sinh viên"} ({selectedFeedback.user_email || `ID: ${selectedFeedback.user_id}`})
                </p>
              </div>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Điểm tổng quan & Gói */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 rounded-xl border border-border/60">
                <div>
                  <span className="text-muted-foreground">Gói hiện tại:</span>
                  <div className="font-bold text-foreground uppercase mt-0.5">
                    {selectedFeedback.current_plan}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Đánh giá chung:</span>
                  <div className="font-bold text-amber-400 flex items-center gap-1 mt-0.5">
                    <span>{selectedFeedback.overall_rating} / 5</span>
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Điểm NPS:</span>
                  <div className="font-bold text-teal-400 mt-0.5">
                    {selectedFeedback.will_recommend !== null ? `${selectedFeedback.will_recommend} / 10` : "—"}
                  </div>
                </div>
              </div>

              {/* Chi tiết 5 khía cạnh */}
              {selectedFeedback.aspect_ratings && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-foreground">Điểm đánh giá từng khía cạnh:</div>
                  <div className="space-y-1.5 bg-card p-3 rounded-xl border border-border/60">
                    {Object.entries(selectedFeedback.aspect_ratings).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center py-1 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground">{formatAspectLabel(k)}:</span>
                        <span className="font-bold text-foreground bg-muted/60 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                          {v} {k === "csat_10" ? "/ 10" : "/ 5 ★"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chi tiết từng tính năng */}
              {selectedFeedback.feature_ratings && Object.keys(selectedFeedback.feature_ratings).length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-foreground">Đánh giá theo tính năng:</div>
                  <div className="grid grid-cols-2 gap-2 bg-card p-3 rounded-xl border border-border/60">
                    {Object.entries(selectedFeedback.feature_ratings).map(([k, v]) => (
                      <div key={k} className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">{formatFeatureName(k)}:</span>
                        <span className="font-semibold text-amber-400 flex items-center gap-1">
                          <span>{v}</span>
                          <Star className="w-3 h-3 fill-amber-400" />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lý do đánh giá thấp */}
              {selectedFeedback.low_rating_reasons && selectedFeedback.low_rating_reasons.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-semibold text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Lý do đánh giá thấp (≤ 3 sao):
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground bg-rose-500/5 border border-rose-500/20 p-3 rounded-xl">
                    {selectedFeedback.low_rating_reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Lời khen */}
              {selectedFeedback.best_thing && (
                <div className="space-y-1">
                  <div className="font-semibold text-teal-400 flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5" />
                    Ấn tượng / Hài lòng nhất:
                  </div>
                  <p className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/20 text-foreground whitespace-pre-wrap">
                    {selectedFeedback.best_thing}
                  </p>
                </div>
              )}

              {/* Góp ý cải tiến */}
              {selectedFeedback.suggested_change && (
                <div className="space-y-1">
                  <div className="font-semibold text-amber-400 flex items-center gap-1">
                    <Lightbulb className="w-3.5 h-3.5" />
                    Đề xuất cải tiến:
                  </div>
                  <p className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-foreground whitespace-pre-wrap">
                    {selectedFeedback.suggested_change}
                  </p>
                </div>
              )}

              {/* Mức giá sẵn sàng trả */}
              {selectedFeedback.pay_willingness && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/60">
                  <span className="text-muted-foreground">Mức giá sẵn sàng chi trả:</span>
                  <span className="font-semibold text-foreground">
                    {selectedFeedback.pay_willingness}
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-border bg-muted/40 text-right">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedFeedback(null)}
                className="text-xs"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
