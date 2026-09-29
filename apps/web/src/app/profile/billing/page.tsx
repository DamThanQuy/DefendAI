"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Crown, Zap, Sparkles, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMembershipPlan, type MembershipPlan } from "@/lib/mock-ai-data";

const PLAN_INFO: Record<MembershipPlan, { name: string; color: string; icon: React.ReactNode; nextPlan: "premium" | "vip" }> = {
  free: { name: "Free", color: "text-muted-foreground", icon: <Sparkles className="w-5 h-5" />, nextPlan: "premium" },
  premium: { name: "Premium", color: "text-primary", icon: <Zap className="w-5 h-5 text-primary" />, nextPlan: "vip" },
  vip: { name: "VIP", color: "text-accent", icon: <Crown className="w-5 h-5 text-accent" />, nextPlan: "vip" },
};

export default function BillingPage() {
  const [account, setAccount] = useState<{ wallet: { balance: number }; subscription: { plan_name: string; expires_at: string; features: { label: string; included: boolean }[] } | null } | null>(null);
  const [depositAmount, setDepositAmount] = useState("100000");
  const [depositOrder, setDepositOrder] = useState<{ order_code: string; status: string; amount?: number; payment_instructions?: { type?: string; qr_url?: string; payment_url?: string; transfer_content?: string } } | null>(null);
  const [depositMessage, setDepositMessage] = useState("");

  useEffect(() => {
    fetch("/api/payment/account", { headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` }, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(setAccount)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!depositOrder || depositOrder.status === "paid") return;
    let cancelled = false;
    const checkDeposit = async () => {
      const response = await fetch(`/api/payment/orders/${depositOrder.order_code}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
        cache: "no-store",
      });
      if (!response.ok || cancelled) return;
      const data = await response.json();
      setDepositOrder(data.order);
      if (data.order.status === "paid") {
        const accountResponse = await fetch("/api/payment/account", {
          headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
          cache: "no-store",
        });
        if (accountResponse.ok && !cancelled) {
          setAccount(await accountResponse.json());
          setDepositMessage("Nạp tiền thành công. Số dư ví đã được cập nhật.");
        }
      }
    };
    const timer = window.setInterval(() => { checkDeposit().catch(() => undefined); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [depositOrder]);

  const subscription = account?.subscription;
  async function createDeposit() {
    setDepositMessage("");
    const response = await fetch("/api/payment/create-order", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` }, body: JSON.stringify({ purpose: "wallet", method: "payos", amount: Number(depositAmount), cycle: "monthly" }) });
    const data = await response.json();
    if (!response.ok) setDepositMessage(data.detail || "Không thể tạo đơn nạp ví.");
    else setDepositOrder(data.order);
  }
  const [plan, setPlan] = useState<MembershipPlan>("free");

  useEffect(() => {
    setPlan(getMembershipPlan());
  }, []);

  const planInfo = PLAN_INFO[plan];
  const isVip = plan === "vip";
  const nextPlan = planInfo.nextPlan;
  const displayPlanName = subscription?.plan_name || planInfo.name;
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-primary">
        <CreditCard className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">
          Gói & Giao dịch
        </span>
      </div>
      <div>
        <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
          Gói thành viên
        </h1>
        <p className="text-muted-foreground">
          Quản lý gói hiện tại và lịch sử giao dịch của bạn.
        </p>
      </div>

      {/* Current plan */}
      <div className="dark-card rounded-2xl p-6 md:p-10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/15 blur-[80px] rounded-full" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {planInfo.icon}
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Gói hiện tại
              </span>
            </div>
            <h2 className={`text-4xl font-serif font-black mb-2 ${planInfo.color}`}>
              {displayPlanName}
            </h2>
            <p className="text-muted-foreground text-sm max-w-md">
              {subscription ? `Đang sử dụng đến ${new Date(subscription.expires_at).toLocaleDateString("vi-VN")}.` : "Bạn đang dùng gói miễn phí. Nâng cấp để mở khóa tính năng cao cấp."}
            </p>
          </div>
          {!subscription || displayPlanName !== "VIP" ? <Link
            href={`/checkout?plan=${nextPlan}&cycle=monthly`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-primary-foreground rounded-full text-sm font-bold shadow-[0_0_20px_hsl(var(--primary)/0.45)] hover:brightness-110 transition-all shrink-0"
          >
            Nâng cấp {nextPlan === "vip" ? "VIP" : "Premium"} ngay
            <ArrowRight className="w-4 h-4" />
          </Link> : null}
        </div>
      </div>

      <div className="dark-card rounded-2xl p-6 flex items-center justify-between gap-4">
        <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Ví DefendAI</p><p className="text-2xl font-bold mt-1">{(account?.wallet.balance || 0).toLocaleString("vi-VN")}đ</p></div>
        <span className="text-sm text-muted-foreground">Có thể dùng để mua gói ngay</span>
      </div>

      <div className="dark-card rounded-2xl p-6">
        <h3 className="text-lg font-serif font-bold">Nạp tiền vào ví</h3>
        <p className="text-sm text-muted-foreground mt-1">Thanh toán qua PayOS, tiền sẽ tự động được cộng vào ví sau khi giao dịch thành công.</p>
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <input className="rounded-md border border-border bg-background px-3 py-2" inputMode="numeric" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value.replace(/[^0-9]/g, ""))} aria-label="Số tiền nạp" />
          <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground font-semibold" onClick={createDeposit}>Tạo QR nạp ví</button>
        </div>
        {depositOrder && <div className="mt-5 flex flex-col sm:flex-row items-center gap-4"><img src={depositOrder.payment_instructions?.qr_url} alt="QR nạp ví PayOS" className="w-40 h-40 bg-white p-2 rounded-md" /><div className="text-sm"><p>Mã đơn: <strong>{depositOrder.order_code}</strong></p>{depositOrder.payment_instructions?.payment_url && <a className="mt-3 inline-block rounded-md bg-primary px-3 py-2 text-primary-foreground font-semibold" href={depositOrder.payment_instructions.payment_url} target="_blank" rel="noreferrer">Mở trang thanh toán PayOS</a>}<p className="mt-2 text-muted-foreground">Sau khi thanh toán, hệ thống tự động cập nhật số dư ví.</p></div></div>}
        {depositMessage && <p className="mt-3 text-sm text-muted-foreground">{depositMessage}</p>}
      </div>

      {/* Benefits */}
      <div className="dark-card rounded-2xl p-6">
        <h3 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-500" />
          Quyền lợi của gói {displayPlanName}
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {(subscription?.features?.filter((feature) => feature.included).map((feature) => feature.label) || [
            "Upload không giới hạn đồ án",
            "Mock defense không giới hạn",
            "Phân tích code chuyên sâu",
            "Đánh giá theo rubric chi tiết",
            "Tạo câu hỏi phản biện không giới hạn",
            "Hỗ trợ ưu tiên 24/7",
            ...(isVip
              ? ["Phòng Mock AI trực tuyến 24/7", "Hội đồng AI 3 chuyên gia"]
              : []),
          ]).map((b) => (
            <li
              key={b}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              {b}
            </li>
          ))}
        </ul>
      </div>

      <div className="dark-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Lịch sử giao dịch sẽ hiển thị khi bạn nâng cấp lên gói Premium/VIP.
      </div>

      <Link
        href="/profile"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại tổng quan
      </Link>
    </div>
  );
}