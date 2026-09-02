"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminOverview } from "@/hooks/useAdminData";

export default function AdminOverviewPage() {
  const { overview, overviewLoading } = useAdminOverview();

  const cards = [
    { label: "Tổng doanh thu", value: overviewLoading ? "..." : `${(overview?.total_revenue ?? 0).toLocaleString("vi-VN")} ₫`, sub: "Chưa có module thanh toán (placeholder)" },
    { label: "User hoạt động", value: overviewLoading ? "..." : overview?.total_users, sub: `Mới: ${overview?.new_users ?? 0}` },
    { label: "Mentor", value: overviewLoading ? "..." : overview?.total_mentors, sub: "Đang hoạt động" },
    { label: "Session thành công", value: overviewLoading ? "..." : overview?.completed_bookings, sub: `/${overview?.total_bookings ?? 0} lịch hẹn` },
    { label: "Lịch chờ xác nhận", value: overviewLoading ? "..." : overview?.pending_bookings, sub: "Cần mentor duyệt" },
    { label: "Code Review", value: overviewLoading ? "..." : overview?.completed_reviews, sub: `/${overview?.total_reviews ?? 0} lượt quét` },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Tổng quan hệ thống</h1>
        <p className="text-[14px] text-muted-foreground">Các chỉ số tổng quan của nền tảng.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="text-2xl">{c.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
