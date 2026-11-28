"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { isAxiosError } from "axios";
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
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getPaymentOrderStatus,
  paymentStatusError,
  type PaymentOrderStatus,
} from "@/app/checkout/payment-data";
import { parseApiDate } from "@/lib/datetime";
import { useAuthContext } from "@/providers/AuthProvider";

function getPlanInfo(planId: string, planName: string | null) {
  if (planId === "vip") return { name: planName || "VIP", color: "amber", icon: "crown" };
  return { name: planName || "Premium", color: "primary", icon: "zap" };
}

export default function PaymentSuccessPage() {
  return (
    <Suspense>
      <PaymentSuccessContent />
    </Suspense>
  );
}

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const { refreshUser } = useAuthContext();
  const orderId = searchParams.get("order_id") || searchParams.get("orderCode");
  const [confirmation, setConfirmation] = useState<{ orderId: string; data: PaymentOrderStatus } | null>(null);
  const [checkError, setCheckError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const order = confirmation?.orderId === orderId ? confirmation.data : null;
  const planId = order?.membership?.plan || searchParams.get("plan") || "premium";
  const cycle = order?.membership?.cycle || searchParams.get("cycle") || "monthly";
  const plan = getPlanInfo(planId, searchParams.get("plan_name"));

  useEffect(() => {
    if (!orderId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setCheckError("");

    const check = async () => {
      try {
        const data = await getPaymentOrderStatus(orderId, controller.signal);
        if (controller.signal.aborted) return;
        setCheckError("");
        setConfirmation({ orderId, data });
        if (data.status === "PENDING" || data.status === "AWAITING_REVIEW") {
          timer = setTimeout(check, 5000);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setCheckError(paymentStatusError(error));
        const responseStatus = isAxiosError(error) ? error.response?.status : undefined;
        if (!responseStatus || responseStatus >= 500 || responseStatus === 429) {
          timer = setTimeout(check, 5000);
        }
      }
    };
    void check();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [orderId, retryCount]);

  const paid = order?.status === "PAID";
  useEffect(() => {
    if (!paid) return;
    void refreshUser();
    const t = setTimeout(() => {
      window.location.href = "/profile/billing";
    }, 10000);
    return () => clearTimeout(t);
  }, [paid, refreshUser]);

  if (!paid) {
    const orderClosed = order?.status === "CANCELLED" || order?.status === "EXPIRED";
    const message = !orderId
      ? "Không tìm thấy mã đơn hàng."
      : checkError || order?.message || "Hệ thống đang kiểm tra giao dịch. Vui lòng chờ xác nhận.";
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-lg space-y-4 p-8 text-center">
          <h1 className="text-2xl font-bold">Xác nhận thanh toán</h1>
          <p role="status" className="text-sm text-muted-foreground">{message}</p>
          {orderId && <p className="text-sm font-mono">Đơn #{orderId}</p>}
          {orderId && !orderClosed && checkError ? (
            <Button onClick={() => setRetryCount((count) => count + 1)}>Kiểm tra lại</Button>
          ) : orderId && !orderClosed && (
            <Loader2 aria-hidden="true" className="mx-auto h-5 w-5 animate-spin text-primary" />
          )}
          <Link href="/profile/billing" className="block text-sm text-primary">Về trang quản lý gói</Link>
        </Card>
      </div>
    );
  }

  const expiresAt = order?.membership?.expires_at ? parseApiDate(order.membership.expires_at) : null;

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
            className="text-4xl md:text-5xl font-black mb-3"
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
                <h2 className="text-2xl font-black">
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
                  {expiresAt?.toLocaleDateString("vi-VN") || "Đang cập nhật"}
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
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Quyền lợi của bạn đã được mở khóa
            </h3>
            <ul className="space-y-2 text-sm">
              {[
                "Upload không giới hạn đồ án",
                "Mock Room với mentor không giới hạn",
                "Phân tích tài liệu AI nâng cao",
                "Báo cáo PDF chi tiết + biểu đồ",
                "Hỗ trợ ưu tiên 24/7",
                ...(planId === "vip"
                  ? ["Phòng Mock AI trực tuyến 24/7", "Hội đồng AI 3 chuyên gia"]
                  : []),
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
