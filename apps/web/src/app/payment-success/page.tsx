"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Crown,
  Zap,
  ArrowRight,
  Calendar,
  CreditCard,
  FileText,
  Share2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function getPlanInfo(planId: string) {
  if (planId === "vip") return { name: "VIP", color: "amber", icon: "crown" };
  if (planId === "premium") return { name: "Premium", color: "primary", icon: "zap" };
  return { name: "Premium", color: "primary", icon: "zap" };
}

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan") || "premium";
  const cycle = searchParams.get("cycle") || "monthly";
  const orderId = searchParams.get("order_id") || `MOCK-${Date.now()}`;
  const plan = getPlanInfo(planId);

  // Auto-redirect to dashboard after 10s
  useEffect(() => {
    const t = setTimeout(() => {
      window.location.href = "/profile/billing";
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  const expiresAt = new Date();
  if (cycle === "monthly") {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  } else {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-background to-primary/5" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 blur-[100px] rounded-full" />

      <div className="relative w-full max-w-2xl">
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 0.8 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500/20 border-4 border-emerald-500/40 mb-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl md:text-5xl font-serif font-black mb-3"
          >
            Thanh toán thành công! 🎉
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground text-lg"
          >
            Cảm ơn bạn đã đăng ký gói {plan.name}. Tài khoản của bạn đã được nâng cấp.
          </motion.p>
        </motion.div>

        {/* Order details */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="p-6 md:p-8 mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                plan.color === "amber"
                  ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white"
                  : "bg-gradient-to-br from-primary to-indigo-500 text-white"
              }`}>
                {plan.icon === "crown" ? (
                  <Crown className="w-7 h-7" />
                ) : (
                  <Zap className="w-7 h-7" />
                )}
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-1">
                  Đã kích hoạt
                </div>
                <h2 className="text-2xl font-serif font-black">
                  Gói {plan.name}
                </h2>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  Mã đơn hàng
                </div>
                <span className="font-mono font-bold">{orderId}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  Hiệu lực đến
                </div>
                <span className="font-semibold">
                  {expiresAt.toLocaleDateString("vi-VN")}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CreditCard className="w-4 h-4" />
                  Chu kỳ thanh toán
                </div>
                <span className="font-semibold">
                  {cycle === "monthly" ? "Hàng tháng" : "Hàng năm"}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Premium benefits unlocked */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="p-6 md:p-8 mb-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/30">
            <h3 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Quyền lợi của bạn đã được mở khóa
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                "Upload không giới hạn đồ án",
                "Mock defense không giới hạn",
                "Phân tích tài liệu AI nâng cao",
                "Báo cáo PDF chi tiết + biểu đồ",
                "Hỗ trợ ưu tiên 24/7",
              ].map((b) => (
                <li key={b} className="flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Link href="/documents" className="flex-1">
            <Button className="w-full h-12 rounded-xl text-base font-semibold shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:brightness-110 group">
              Bắt đầu sử dụng
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/profile/billing" className="flex-1">
            <Button variant="outline" className="w-full h-12 rounded-xl text-base font-semibold">
              Xem gói của tôi
            </Button>
          </Link>
        </motion.div>

        {/* Trust footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-center text-xs text-muted-foreground"
        >
          <div className="flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Giao dịch được bảo mật bởi SSL · Hóa đơn đã gửi qua email
          </div>
          <p className="mt-3">Tự động chuyển về trang quản lý gói sau 10 giây...</p>
        </motion.div>
      </div>
    </div>
  );
}
