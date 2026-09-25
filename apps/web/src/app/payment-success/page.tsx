"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Order = {
  order_code: string;
  status: string;
  plan_name: string | null;
  amount: number;
  paid_at: string | null;
};

export default function PaymentSuccessPage() {
  const orderCode = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("order_id");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderCode) {
      setError("Thiếu mã đơn hàng.");
      return;
    }
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/payment/orders/${orderCode}`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` }, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if (!cancelled) setError(data.detail || "Không thể kiểm tra đơn hàng.");
        return;
      }
      if (!cancelled) setOrder(data.order);
    }
    load().catch(() => setError("Không thể kết nối máy chủ."));
    return () => { cancelled = true; };
  }, [orderCode]);

  useEffect(() => {
    if (!order || order.status === "paid" || !orderCode) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/payment/orders/${orderCode}`, { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` }, cache: "no-store" });
      if (response.ok) setOrder((await response.json()).order);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [order, orderCode]);

  useEffect(() => {
    if (order?.status !== "paid") return;
    const timer = window.setTimeout(() => { window.location.href = "/profile/billing"; }, 5000);
    return () => window.clearTimeout(timer);
  }, [order?.status]);

  const paid = order?.status === "paid";
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-xl p-8 text-center">
        {error ? <>
          <h1 className="text-2xl font-bold text-red-500">Không thể xác nhận đơn</h1>
          <p className="mt-3 text-muted-foreground">{error}</p>
        </> : paid ? <>
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500" />
          <h1 className="mt-5 text-3xl font-serif font-black">Thanh toán thành công</h1>
          <p className="mt-3 text-muted-foreground">Gói {order.plan_name} đã được kích hoạt cho tài khoản của bạn.</p>
          <p className="mt-4 text-sm text-muted-foreground">Mã đơn: <strong>{order.order_code}</strong></p>
          <p className="mt-3 text-xs text-muted-foreground">Tự động quay về quản lý gói sau 5 giây.</p>
        </> : <>
          <Clock3 className="w-16 h-16 mx-auto text-amber-500" />
          <h1 className="mt-5 text-3xl font-serif font-black">Đang chờ xác nhận</h1>
          <p className="mt-3 text-muted-foreground">Đơn hàng đã ghi nhận. Trang sẽ tự cập nhật khi admin xác nhận giao dịch.</p>
          {order && <p className="mt-4 text-sm text-muted-foreground">Mã đơn: <strong>{order.order_code}</strong></p>}
        </>}
        <div className="mt-8 flex gap-3 justify-center">
          <Link href="/profile/billing"><Button>Xem gói của tôi <ArrowRight className="ml-2 w-4 h-4" /></Button></Link>
          <Link href="/pricing"><Button variant="outline">Quay về bảng giá</Button></Link>
        </div>
      </Card>
    </div>
  );
}
