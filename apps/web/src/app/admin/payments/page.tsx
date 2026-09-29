"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authHeaders } from "@/hooks/useAdminData";

type Order = { order_code: string; plan_name: string | null; amount: number; method: string; created_at: string };

export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/payments", { headers: authHeaders(), cache: "no-store" });
    if (response.ok) setOrders((await response.json()).orders || []);
  }

  useEffect(() => { load().catch(() => setMessage("Không tải được đơn hàng.")); }, []);

  async function confirm(orderCode: string) {
    const response = await fetch(`/api/admin/payments/${orderCode}/confirm`, { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setMessage(response.ok ? `Đã duyệt ${orderCode}.` : "Duyệt đơn thất bại.");
    if (response.ok) await load();
  }

  return <div className="max-w-6xl mx-auto space-y-6">
    <div><h1 className="text-2xl font-serif font-bold">Duyệt thanh toán</h1><p className="text-sm text-muted-foreground mt-1">Kiểm tra giao dịch thực tế trước khi cấp subscription hoặc cộng tiền vào ví.</p></div>
    {message && <p className="text-sm text-muted-foreground">{message}</p>}
    <Card className="p-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Mã đơn</th><th>Gói</th><th>Phương thức</th><th>Số tiền</th><th>Thời gian</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.order_code} className="border-b"><td className="py-3 font-mono">{order.order_code}</td><td>{order.plan_name || "Nạp ví"}</td><td>{order.method}</td><td>{order.amount.toLocaleString("vi-VN")}đ</td><td>{new Date(order.created_at).toLocaleString("vi-VN")}</td><td className="text-right"><Button size="sm" onClick={() => confirm(order.order_code)}>Đã kiểm tra, duyệt</Button></td></tr>)}</tbody></table>{!orders.length && <p className="py-8 text-center text-muted-foreground">Không có đơn chờ duyệt.</p>}</Card>
  </div>;
}
