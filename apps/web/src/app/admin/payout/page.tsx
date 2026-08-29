"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPayoutPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">💰 Tài chính & Rút tiền (Payout)</h1>
        <p className="text-[14px] text-muted-foreground">
          Đối soát thu nhập Mentor và duyệt lệnh rút tiền. Module ví / rút tiền đang được phát triển.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Đối soát tài chính</CardTitle>
          <CardDescription>Chưa có dữ liệu giao dịch — cần tích hợp ví thu nhập và cổng thanh toán.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">Tổng doanh thu</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">0 ₫</p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">Lệnh rút tiền chờ</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">0</p>
          </div>
          <div className="rounded-xl bg-zinc-900/60 p-4">
            <p className="text-xs text-zinc-500">Đã chi trả</p>
            <p className="text-xl font-bold text-zinc-200 mt-1">0 ₫</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
