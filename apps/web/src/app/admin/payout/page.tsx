"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  CreditCard,
  Crown,
  Download,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  Copy,
  Check,
  Calendar,
  Layers,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminFinancialReports, FinancialFilterParams } from "@/hooks/useAdminData";

export default function AdminPayoutPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [datePreset, setDatePreset] = useState<"30d" | "7d" | "all" | "custom">("30d");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Compute preset date strings
  const getPresetDates = (preset: "30d" | "7d" | "all" | "custom") => {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    if (preset === "7d") {
      const start = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      return { startDate: start, endDate: end };
    }
    if (preset === "30d") {
      const start = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      return { startDate: start, endDate: end };
    }
    return { startDate: undefined, endDate: undefined };
  };

  const initialDates = getPresetDates("30d");
  const { data, loading, error, filters, setFilters, refetch } = useAdminFinancialReports({
    startDate: initialDates.startDate,
    endDate: initialDates.endDate,
    status: "all",
    method: "all",
    purpose: "all",
    limit: 100,
  });

  const handlePresetChange = (preset: "30d" | "7d" | "all") => {
    setDatePreset(preset);
    const dates = getPresetDates(preset);
    setFilters((prev) => ({
      ...prev,
      startDate: dates.startDate,
      endDate: dates.endDate,
    }));
  };

  const handleCustomDate = (field: "startDate" | "endDate", value: string) => {
    setDatePreset("custom");
    setFilters((prev) => ({
      ...prev,
      [field]: value || undefined,
    }));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!data?.transactions?.length) return;
    const headers = [
      "Mã đơn",
      "Khách hàng",
      "Email",
      "Khoản mục",
      "Gói",
      "Cổng thanh toán",
      "Mã đối soát PayOS/Bank",
      "Số tiền (VND)",
      "Trạng thái",
      "Thời gian tạo",
      "Thời gian thanh toán",
    ];

    const rows = data.transactions.map((tx) => [
      tx.order_code,
      `"${tx.user_name || ""}"`,
      tx.user_email,
      tx.purpose === "wallet" ? "Nạp ví" : "Gói hội viên",
      `"${tx.plan_name || "-"}"`,
      tx.method.toUpperCase(),
      `"${tx.provider_reference || "-"}"`,
      tx.amount,
      tx.status,
      tx.created_at || "",
      tx.paid_at || "",
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Bao_cao_tai_chinh_DefendAI_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter transactions by client search
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    if (!searchTerm.trim()) return data.transactions;
    const q = searchTerm.toLowerCase().trim();
    return data.transactions.filter(
      (tx) =>
        tx.order_code.toLowerCase().includes(q) ||
        tx.user_email.toLowerCase().includes(q) ||
        (tx.user_name && tx.user_name.toLowerCase().includes(q)) ||
        (tx.provider_reference && tx.provider_reference.toLowerCase().includes(q)) ||
        (tx.plan_name && tx.plan_name.toLowerCase().includes(q))
    );
  }, [data?.transactions, searchTerm]);

  // Max value for timeline chart scaling
  const maxDailyRevenue = useMemo(() => {
    if (!data?.timeline?.length) return 100000;
    const max = Math.max(...data.timeline.map((t) => t.revenue));
    return max > 0 ? max : 100000;
  }, [data?.timeline]);

  const totalMethodAmount = useMemo(() => {
    if (!data?.by_method?.length) return 1;
    const sum = data.by_method.reduce((acc, curr) => acc + curr.amount, 0);
    return sum > 0 ? sum : 1;
  }, [data?.by_method]);

  const totalPlanAmount = useMemo(() => {
    if (!data?.by_plan?.length) return 1;
    const sum = data.by_plan.reduce((acc, curr) => acc + curr.amount, 0);
    return sum > 0 ? sum : 1;
  }, [data?.by_plan]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <h1 className="text-2xl font-serif font-bold text-foreground tracking-tight">
              Báo cáo Tài chính & Đối soát
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
              Live DB
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">
            Theo dõi dòng tiền thực tế, phân bổ doanh thu theo gói và đối soát đối chiếu giao dịch với PayOS & Ngân hàng.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={loading}
            className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin text-teal-400" : ""}`} />
            Làm mới
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={!data?.transactions?.length}
            className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-teal-400" />
            Xuất CSV
          </Button>

          {data?.summary?.total_orders_awaiting_review ? (
            <Button size="sm" asChild className="bg-amber-600 hover:bg-amber-500 text-white font-medium">
              <Link href="/admin/payments">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Duyệt {data.summary.total_orders_awaiting_review} đơn chờ
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Date & Filter Controls */}
      <Card className="border-zinc-800/80 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground mr-1 flex items-center">
              <Calendar className="h-3.5 w-3.5 mr-1 text-zinc-400" /> Thời gian:
            </span>
            <Button
              size="sm"
              variant={datePreset === "7d" ? "default" : "outline"}
              onClick={() => handlePresetChange("7d")}
              className={`h-8 text-xs ${datePreset === "7d" ? "bg-teal-600 hover:bg-teal-500 text-white" : "border-zinc-800 bg-zinc-900/50"}`}
            >
              7 ngày qua
            </Button>
            <Button
              size="sm"
              variant={datePreset === "30d" ? "default" : "outline"}
              onClick={() => handlePresetChange("30d")}
              className={`h-8 text-xs ${datePreset === "30d" ? "bg-teal-600 hover:bg-teal-500 text-white" : "border-zinc-800 bg-zinc-900/50"}`}
            >
              30 ngày qua
            </Button>
            <Button
              size="sm"
              variant={datePreset === "all" ? "default" : "outline"}
              onClick={() => handlePresetChange("all")}
              className={`h-8 text-xs ${datePreset === "all" ? "bg-teal-600 hover:bg-teal-500 text-white" : "border-zinc-800 bg-zinc-900/50"}`}
            >
              Toàn thời gian
            </Button>

            <div className="flex items-center gap-1.5 ml-2 border-l border-zinc-800 pl-3">
              <Input
                type="date"
                value={filters.startDate || ""}
                onChange={(e) => handleCustomDate("startDate", e.target.value)}
                className="h-8 text-xs w-36 bg-zinc-950/60 border-zinc-800"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={filters.endDate || ""}
                onChange={(e) => handleCustomDate("endDate", e.target.value)}
                className="h-8 text-xs w-36 bg-zinc-950/60 border-zinc-800"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filters.method || "all"}
              onChange={(e) => setFilters((prev) => ({ ...prev, method: e.target.value }))}
              className="h-8 text-xs rounded-md bg-zinc-950/60 border border-zinc-800 px-2.5 text-zinc-300 focus:outline-none focus:border-teal-500"
            >
              <option value="all">Tất cả cổng thanh toán</option>
              <option value="payos">PayOS (VietQR tự động)</option>
              <option value="vietqr">VietQR thủ công</option>
              <option value="wallet">Ví nội bộ</option>
            </select>

            <select
              value={filters.purpose || "all"}
              onChange={(e) => setFilters((prev) => ({ ...prev, purpose: e.target.value }))}
              className="h-8 text-xs rounded-md bg-zinc-950/60 border border-zinc-800 px-2.5 text-zinc-300 focus:outline-none focus:border-teal-500"
            >
              <option value="all">Tất cả mục đích</option>
              <option value="subscription">Gói Hội viên</option>
              <option value="wallet">Nạp ví</option>
            </select>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="p-4 rounded-xl border border-red-900/50 bg-red-950/30 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Gross Revenue */}
        <Card className="border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase tracking-wider font-medium text-zinc-400">
                Tổng doanh thu thực nhận
              </CardDescription>
              <span className="p-1.5 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20">
                <TrendingUp className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-mono font-bold text-foreground mt-1">
              {loading ? "..." : `${(data?.summary?.total_gross_revenue ?? 0).toLocaleString("vi-VN")} ₫`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Đơn thanh toán thành công:</span>
              <strong className="font-mono text-zinc-200">{data?.summary?.total_orders_paid ?? 0}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Subscription Revenue */}
        <Card className="border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase tracking-wider font-medium text-zinc-400">
                Doanh thu Gói Hội Viên
              </CardDescription>
              <span className="p-1.5 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Crown className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-mono font-bold text-foreground mt-1">
              {loading ? "..." : `${(data?.summary?.subscription_revenue ?? 0).toLocaleString("vi-VN")} ₫`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Hội viên VIP / Premium active:</span>
              <strong className="font-mono text-zinc-200">{data?.summary?.active_subscribers ?? 0}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Wallet Deposits */}
        <Card className="border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase tracking-wider font-medium text-zinc-400">
                Doanh thu Nạp Ví
              </CardDescription>
              <span className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Wallet className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-mono font-bold text-foreground mt-1">
              {loading ? "..." : `${(data?.summary?.wallet_deposit_revenue ?? 0).toLocaleString("vi-VN")} ₫`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground flex items-center justify-between">
              <span>Tổng số dư ví toàn sàn:</span>
              <strong className="font-mono text-zinc-200">
                {(data?.summary?.total_wallet_balance ?? 0).toLocaleString("vi-VN")} ₫
              </strong>
            </p>
          </CardContent>
        </Card>

        {/* Pending & Review Status */}
        <Card className="border-zinc-800/80 bg-zinc-900/50 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase tracking-wider font-medium text-zinc-400">
                Đơn cần xử lý / Đối soát
              </CardDescription>
              <span className="p-1.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <CreditCard className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-mono font-bold text-foreground mt-1">
              {loading ? "..." : `${data?.summary?.total_orders_awaiting_review ?? 0}`}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">đơn chờ duyệt</span>
            </CardTitle>
        </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Đang mở cổng thanh toán:</span>
              <strong className="font-mono text-zinc-200">{data?.summary?.total_orders_pending ?? 0} đơn</strong>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Revenue Chart Timeline */}
      <Card className="border-zinc-800/80 bg-zinc-900/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal-400" />
              Xu hướng doanh thu theo ngày
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Biểu đồ đối soát doanh thu thực nhận theo từng ngày.</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground">Cao nhất: </span>
            <strong className="font-mono text-xs text-teal-400">{maxDailyRevenue.toLocaleString("vi-VN")} ₫</strong>
          </div>
        </div>

        {/* SVG Bar Chart */}
        <div className="h-44 w-full flex items-end gap-1.5 pt-4 pb-2 border-b border-zinc-800/80">
          {data?.timeline?.map((point) => {
            const heightPercent = maxDailyRevenue > 0 ? Math.round((point.revenue / maxDailyRevenue) * 100) : 0;
            return (
              <div
                key={point.date}
                className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
              >
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                  <div className="bg-zinc-950 border border-zinc-700/80 rounded-md p-2 shadow-xl text-[11px] whitespace-nowrap">
                    <p className="font-mono text-zinc-400">{point.date}</p>
                    <p className="font-mono font-bold text-teal-400 mt-0.5">{point.revenue.toLocaleString("vi-VN")} ₫</p>
                    <p className="text-[10px] text-zinc-400">{point.orders_count} giao dịch</p>
                  </div>
                  <div className="w-2 h-2 bg-zinc-950 border-r border-b border-zinc-700/80 rotate-45 -mt-1" />
                </div>

                {/* Bar */}
                <div
                  style={{ height: `${Math.max(point.revenue > 0 ? 8 : 2, heightPercent)}%` }}
                  className={`w-full rounded-t transition-all duration-200 ${
                    point.revenue > 0
                      ? "bg-gradient-to-t from-teal-700 to-teal-400 group-hover:brightness-125"
                      : "bg-zinc-800/30 group-hover:bg-zinc-800/60"
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Timeline X-Axis labels */}
        <div className="flex justify-between items-center text-[10px] font-mono text-zinc-400 pt-2">
          <span>{data?.timeline?.[0]?.date ?? "-"}</span>
          <span>{data?.timeline?.[Math.floor((data?.timeline?.length || 0) / 2)]?.date ?? "-"}</span>
          <span>{data?.timeline?.[(data?.timeline?.length || 1) - 1]?.date ?? "-"}</span>
        </div>
      </Card>

      {/* Breakdowns: Channels & Plans */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* By Payment Method */}
        <Card className="border-zinc-800/80 bg-zinc-900/40 p-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
            <CreditCard className="h-4 w-4 text-teal-400" />
            Cơ cấu theo Cổng thanh toán (Inflow)
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Đối soát nguồn tiền vào hệ thống.</p>

          <div className="space-y-4">
            {data?.by_method?.length ? (
              data.by_method.map((m) => {
                const percent = Math.round((m.amount / totalMethodAmount) * 100);
                const methodLabel =
                  m.method === "payos"
                    ? "PayOS (VietQR Auto)"
                    : m.method === "vietqr"
                    ? "VietQR Thủ công"
                    : m.method === "wallet"
                    ? "Ví nội bộ"
                    : m.method;
                return (
                  <div key={m.method} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-zinc-300">{methodLabel}</span>
                      <div className="text-right">
                        <strong className="font-mono text-zinc-100">{m.amount.toLocaleString("vi-VN")} ₫</strong>
                        <span className="text-muted-foreground text-[11px] ml-1.5 font-mono">({percent}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-zinc-800/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400">{m.count} giao dịch hoàn tất</p>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">Chưa có giao dịch theo cổng thanh toán.</p>
            )}
          </div>
        </Card>

        {/* By Subscription Plan */}
        <Card className="border-zinc-800/80 bg-zinc-900/40 p-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
            <Crown className="h-4 w-4 text-indigo-400" />
            Doanh số theo Gói dịch vụ
          </h2>
          <p className="text-xs text-muted-foreground mb-4">Tỷ lệ đóng góp doanh thu của từng gói hội viên.</p>

          <div className="space-y-4">
            {data?.by_plan?.length ? (
              data.by_plan.map((p) => {
                const percent = Math.round((p.amount / totalPlanAmount) * 100);
                return (
                  <div key={p.slug} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-zinc-300">Gói {p.plan_name}</span>
                      <div className="text-right">
                        <strong className="font-mono text-zinc-100">{p.amount.toLocaleString("vi-VN")} ₫</strong>
                        <span className="text-muted-foreground text-[11px] ml-1.5 font-mono">({percent}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-zinc-800/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-400">{p.count} lượt đăng ký</p>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground py-4 text-center">Chưa có giao dịch gói dịch vụ.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Reconciliation Table (Bảng đối soát chi tiết) */}
      <Card className="border-zinc-800/80 bg-zinc-900/40 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal-400" />
              Bảng đối soát giao dịch chi tiết
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Danh sách chi tiết đối chiếu giữa mã đơn hệ thống và mã tham chiếu PayOS / Ngân hàng.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tìm theo mã đơn, email, ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs bg-zinc-950/60 border-zinc-800 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-zinc-800/80">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 uppercase tracking-wider text-[10px] font-mono border-b border-zinc-800/80">
              <tr>
                <th className="py-3 px-4">Mã đơn</th>
                <th className="py-3 px-4">Khách hàng</th>
                <th className="py-3 px-4">Khoản mục</th>
                <th className="py-3 px-4">Cổng</th>
                <th className="py-3 px-4">Mã đối soát PayOS/Bank</th>
                <th className="py-3 px-4 text-right">Số tiền</th>
                <th className="py-3 px-4 text-center">Trạng thái</th>
                <th className="py-3 px-4 text-right">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 bg-zinc-900/20">
              {filteredTransactions.length ? (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-zinc-800/30 transition-colors">
                    {/* Order Code */}
                    <td className="py-3 px-4 font-mono font-medium text-zinc-200">
                      <div className="flex items-center gap-1.5">
                        <span>{tx.order_code}</span>
                        <button
                          onClick={() => handleCopy(tx.order_code)}
                          className="text-zinc-400 hover:text-zinc-200 p-0.5"
                          title="Copy mã đơn"
                        >
                          {copiedId === tx.order_code ? (
                            <Check className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="py-3 px-4">
                      <p className="font-medium text-zinc-200">{tx.user_name || "Người dùng DefendAI"}</p>
                      <p className="text-[11px] text-zinc-400 font-mono">{tx.user_email}</p>
                    </td>

                    {/* Purpose / Plan */}
                    <td className="py-3 px-4">
                      {tx.purpose === "wallet" ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded text-[11px]">
                          <Wallet className="h-3 w-3" /> Nạp ví
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-indigo-400 bg-indigo-950/30 px-2 py-0.5 rounded text-[11px]">
                          <Crown className="h-3 w-3" /> {tx.plan_name ? `Gói ${tx.plan_name}` : "Hội viên"}
                        </span>
                      )}
                    </td>

                    {/* Payment Method */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-[11px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        {tx.method}
                      </span>
                    </td>

                    {/* Provider Reference (PayOS / Bank) */}
                    <td className="py-3 px-4 font-mono text-[11px]">
                      {tx.provider_reference ? (
                        <div className="flex items-center gap-1.5 text-zinc-300">
                          <span>{tx.provider_reference}</span>
                          <button
                            onClick={() => handleCopy(tx.provider_reference || "")}
                            className="text-zinc-400 hover:text-zinc-200 p-0.5"
                            title="Copy mã đối soát"
                          >
                            {copiedId === tx.provider_reference ? (
                              <Check className="h-3 w-3 text-teal-400" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-400 italic">Chưa có ref</span>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-100">
                      {tx.amount.toLocaleString("vi-VN")} ₫
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 text-center">
                      {tx.status === "paid" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-teal-950/50 text-teal-400 border border-teal-800/50">
                          <CheckCircle2 className="h-3 w-3" /> Đã thu
                        </span>
                      ) : tx.status === "awaiting_review" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/50 text-amber-400 border border-amber-800/50">
                          <Clock className="h-3 w-3" /> Chờ duyệt
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {tx.status}
                        </span>
                      )}
                    </td>

                    {/* Time */}
                    <td className="py-3 px-4 text-right text-zinc-400 font-mono text-[11px]">
                      {tx.paid_at
                        ? new Date(tx.paid_at).toLocaleString("vi-VN")
                        : tx.created_at
                        ? new Date(tx.created_at).toLocaleString("vi-VN")
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-400">
                    {loading ? "Đang tải dữ liệu giao dịch..." : "Không tìm thấy giao dịch nào khớp với bộ lọc."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>
            Hiển thị <strong>{filteredTransactions.length}</strong> /{" "}
            <strong>{data?.pagination?.total ?? 0}</strong> giao dịch
          </span>
          <span className="font-mono text-[11px]">Dữ liệu được cập nhật từ database DefendAI</span>
        </div>
      </Card>
    </div>
  );
}
