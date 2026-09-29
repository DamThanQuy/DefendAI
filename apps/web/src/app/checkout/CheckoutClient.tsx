"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CreditCard,
  Building2,
  Check,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Crown,
  Zap,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PAYMENT_METHODS,
  getOrderSummary,
  formatVND,
  type PaymentMethodId,
} from "./payment-data";
import { fetchPlans } from "@/app/pricing/pricing-api";

type CheckoutPlan = { id: string; name: string; monthly: number; yearly: number };

const LEGACY_PLAN_SLUGS: Record<string, string> = {
  premium: "100002",
  vip: "100003",
};

export default function CheckoutClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const requestedPlanId = searchParams.get("plan") || "100002";
  const planId = LEGACY_PLAN_SLUGS[requestedPlanId] || requestedPlanId;
  const cycle = (searchParams.get("cycle") || "monthly") as "monthly" | "yearly";

  const [plan, setPlan] = useState<CheckoutPlan | null>(null);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [step, setStep] = useState<"payment" | "processing" | "awaiting" | "done">("payment");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>("vietqr");
  const [paymentOrder, setPaymentOrder] = useState<{ order_code: string; status: string; amount?: number; proration_credit?: number; payment_instructions?: { type?: string; qr_url?: string; payment_url?: string; account_number?: string; account_name?: string; transfer_content?: string } } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetchPlans()
      .then((plans) => {
        const selected = plans.find((item) => item.id === planId || item.id === requestedPlanId);
        if (selected) {
          setPlan({ id: selected.id, name: selected.name, monthly: selected.monthly, yearly: selected.yearly });
        }
      })
      .catch(() => setErrorMsg("Không tải được thông tin gói. Vui lòng thử lại."))
      .finally(() => setPlansLoaded(true));
  }, [planId, requestedPlanId]);

  useEffect(() => {
    if (step !== "awaiting" || selectedMethod !== "payos" || !paymentOrder) return;
    const poll = async () => {
      const response = await fetch(`/api/payment/orders/${paymentOrder.order_code}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      setPaymentOrder(data.order);
      if (data.order.status === "paid") {
        router.push(`/payment-success?order_id=${paymentOrder.order_code}`);
      }
    };
    const timer = window.setInterval(() => { poll().catch(() => undefined); }, 3000);
    return () => window.clearInterval(timer);
  }, [paymentOrder, router, selectedMethod, step]);

  // Redirect if no plan
  useEffect(() => {
    if (plansLoaded && !plan) {
      router.replace("/pricing");
    }
  }, [plan, plansLoaded, router]);

  if (!plansLoaded || !plan) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Đang tải thông tin gói...</div>;

  const order = getOrderSummary(plan, cycle);

  const handlePayment = async () => {
    setIsLoading(true);
    setErrorMsg("");
    setStep("processing");
    try {
      const response = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
        body: JSON.stringify({ plan_id: plan.id, cycle, method: selectedMethod, purpose: "subscription" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Không thể tạo đơn thanh toán");
      const created = data.order;
      setPaymentOrder(created);
      if (created.status === "paid") {
        router.push(`/payment-success?order_id=${created.order_code}`);
      } else {
        setStep("awaiting");
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Không thể tạo đơn thanh toán");
      setStep("payment");
    } finally {
      setIsLoading(false);
    }
  };

  const getMethodIcon = (id: PaymentMethodId) => {
    if (id === "wallet") return <CreditCard className="w-5 h-5" />;
    return <Building2 className="w-5 h-5" />;
  };

  const getMethodColor = (id: PaymentMethodId) => {
    if (id === "wallet") return "bg-indigo-500 text-white";
    if (id === "payos") return "bg-emerald-500 text-white";
    return "bg-amber-500 text-white";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 lg:px-8 max-w-5xl py-4 flex items-center gap-4">
          <Link
            href="/pricing"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-muted-foreground">Thanh toán bảo mật</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 lg:px-8 max-w-5xl py-8">
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-serif font-black mb-2">
            Thanh toán đăng ký Member
          </h1>
          <p className="text-muted-foreground">
            Xác nhận thông tin và chọn phương thức thanh toán phù hợp với bạn.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Payment methods */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3 space-y-6"
          >
            {/* Payment step */}
            {step === "payment" && (
              <>
                {/* Payment methods */}
                <Card className="p-6">
                  <h2 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    Phương thức thanh toán
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method.id}
                        onClick={() => {
                          setSelectedMethod(method.id);
                          setErrorMsg("");
                        }}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                          selectedMethod === method.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40 bg-card"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${getMethodColor(method.id)}`}>
                          {getMethodIcon(method.id)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{method.name}</span>
                            {method.popular && (
                              <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase">
                                Hot
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {method.description}
                          </p>
                        </div>
                        {selectedMethod === method.id && (
                          <Check className="w-5 h-5 text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </Card>

                <Card className="p-6 border-primary/30 bg-primary/5">
                  <h3 className="text-sm font-semibold mb-4">Thông tin thanh toán</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {paymentOrder?.payment_instructions?.qr_url ? <img src={paymentOrder.payment_instructions.qr_url} alt="QR thanh toán" className="w-44 h-44 rounded-lg bg-white p-2" /> : <div className="w-44 h-44 rounded-lg bg-muted flex items-center justify-center text-center text-xs text-muted-foreground p-4">Bấm tạo đơn để nhận QR thanh toán</div>}
                    <div className="text-sm space-y-2 w-full">
                      <p className="text-muted-foreground">Phương thức: <strong className="text-foreground">{PAYMENT_METHODS.find((method) => method.id === selectedMethod)?.name}</strong></p>
                      <p className="text-muted-foreground">Số tiền: <strong className="text-primary">{formatVND(paymentOrder?.amount ?? order.total)}</strong></p>
                      {!!paymentOrder?.proration_credit && <p className="text-xs text-emerald-500">Đã trừ {formatVND(paymentOrder.proration_credit)} giá trị thời gian còn lại.</p>}
                      {paymentOrder?.payment_instructions && (
                        <div className="pt-2 border-t border-border/60">
                          <p>STK: <strong>{paymentOrder.payment_instructions.account_number}</strong> <button type="button" aria-label="Sao chép số tài khoản" title="Sao chép số tài khoản" onClick={() => navigator.clipboard?.writeText(paymentOrder.payment_instructions?.account_number || "")}><Copy className="inline w-3.5 h-3.5 text-primary" /></button></p>
                          <p>Chủ TK: <strong>{paymentOrder.payment_instructions.account_name}</strong></p>
                          <p>Nội dung: <strong>{paymentOrder.payment_instructions.transfer_content}</strong></p>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-amber-500 mt-4">{selectedMethod === "payos" ? "PayOS sẽ tự động xác nhận sau khi giao dịch thành công." : "Đơn QR sẽ chờ admin đối soát trước khi kích hoạt gói."}</p>
                </Card>

                {/* Error message */}
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-sm"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {errorMsg}
                  </motion.div>
                )}

                {/* Pay button */}
                <Button
                  onClick={async () => {
                    if (!paymentOrder) return handlePayment();
                    const response = await fetch(`/api/payment/orders/${paymentOrder.order_code}/submitted`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` } });
                    if (response.ok) setStep("awaiting");
                  }}
                  disabled={isLoading}
                  className="w-full h-14 text-lg font-bold rounded-xl shadow-[0_0_20px_hsl(var(--primary)/0.5)] hover:brightness-110"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Đang xử lý thanh toán...
                    </>
                  ) : (
                    <>
                      {paymentOrder ? "Tôi đã thanh toán" : `Tạo đơn ${formatVND(order.total)}`}
                      <ArrowLeft className="w-5 h-5 ml-2 rotate-180" />
                    </>
                  )}
                </Button>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Bảo mật SSL
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Hoàn tiền 7 ngày
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Hỗ trợ 24/7
                  </div>
                </div>
              </>
            )}

            {/* Processing step */}
            {step === "processing" && (
              <Card className="p-12 text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-6">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  </div>
                  <h2 className="text-2xl font-serif font-bold mb-2">
                    Đang xử lý thanh toán
                  </h2>
                  <p className="text-muted-foreground">
                    Vui lòng chờ trong giây lát, không tắt trình duyệt...
                  </p>
                </motion.div>
              </Card>
            )}

            {step === "awaiting" && paymentOrder && (
              <>
                <Card className="p-6 border-primary/30 bg-primary/5">
                  <h3 className="text-sm font-semibold mb-4">QR và thông tin chuyển khoản</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {paymentOrder.payment_instructions?.qr_url && <img src={paymentOrder.payment_instructions.qr_url} alt="QR thanh toán" className="w-44 h-44 rounded-lg bg-white p-2" />}
                    <div className="text-sm space-y-2 w-full">
                      <p>Mã đơn: <strong>{paymentOrder.order_code}</strong></p>
                      <p>Số tiền: <strong className="text-primary">{formatVND(paymentOrder.amount ?? order.total)}</strong></p>
                      {!!paymentOrder.proration_credit && <p className="text-xs text-emerald-500">Đã trừ {formatVND(paymentOrder.proration_credit)} giá trị thời gian còn lại.</p>}
                      {paymentOrder.payment_instructions?.type === "payos" ? <>{paymentOrder.payment_instructions.payment_url && <a className="inline-flex rounded-md bg-primary px-3 py-2 text-primary-foreground font-semibold" href={paymentOrder.payment_instructions.payment_url} target="_blank" rel="noreferrer">Mở trang thanh toán PayOS</a>}<p className="text-xs text-muted-foreground">Sau khi thanh toán, trang này sẽ tự kiểm tra trạng thái.</p></> : <><p>STK: <strong>{paymentOrder.payment_instructions?.account_number}</strong> <button type="button" aria-label="Sao chép số tài khoản" title="Sao chép số tài khoản" onClick={() => navigator.clipboard?.writeText(paymentOrder.payment_instructions?.account_number || "")}><Copy className="inline w-3.5 h-3.5 text-primary" /></button></p><p>Chủ TK: <strong>{paymentOrder.payment_instructions?.account_name}</strong></p><p>Nội dung: <strong>{paymentOrder.payment_instructions?.transfer_content}</strong></p></>}
                    </div>
                  </div>
                </Card>
                <Card className="p-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-6"><Loader2 className="w-10 h-10 text-amber-500" /></div>
                  <h2 className="text-2xl font-serif font-bold mb-2">{paymentOrder.payment_instructions?.type === "payos" ? "Đang chờ PayOS xác nhận" : "Đang chờ admin xác nhận"}</h2>
                  <p className="text-muted-foreground mb-6">Mã đơn {paymentOrder.order_code}. {paymentOrder.payment_instructions?.type === "payos" ? "Sau khi thanh toán thành công, gói sẽ được kích hoạt tự động." : "Sau khi kiểm tra giao dịch, admin sẽ kích hoạt gói cho bạn."}</p>
                  {paymentOrder.payment_instructions?.type !== "payos" && <Button
                    className="mb-3"
                    onClick={async () => {
                      const response = await fetch(`/api/payment/orders/${paymentOrder.order_code}/submitted`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` } });
                      if (response.ok) setErrorMsg("Đã gửi yêu cầu xác nhận cho admin.");
                      else setErrorMsg("Không thể gửi yêu cầu xác nhận.");
                    }}
                  >Tôi đã thanh toán</Button>}
                  {errorMsg && <p className="text-sm text-muted-foreground mb-3">{errorMsg}</p>}
                  <Link href={`/payment-success?order_id=${paymentOrder.order_code}`}><Button variant="outline">Kiểm tra trạng thái</Button></Link>
                </Card>
              </>
            )}

            {/* Done - redirect notice */}
            {step === "done" && (
              <Card className="p-12 text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                    <Check className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h2 className="text-2xl font-serif font-bold mb-2 text-emerald-500">
                    Thanh toán thành công!
                  </h2>
                  <p className="text-muted-foreground mb-6">
                    Cảm ơn bạn đã đăng ký gói {order.planName}. Đang chuyển hướng...
                  </p>
                  <Link href={`/payment-success?plan=${plan.id}&cycle=${cycle}`}>
                    <Button className="rounded-full px-8">
                      Xem chi tiết đăng ký
                    </Button>
                  </Link>
                </motion.div>
              </Card>
            )}
          </motion.div>

          {/* Right: Order summary */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card className="p-6 sticky top-24">
              <h2 className="text-lg font-serif font-bold mb-4">Tóm tắt đơn hàng</h2>

              {/* Plan info */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  plan.id === "premium" ? "bg-primary/20" : "bg-amber-500/20"
                }`}>
                  {plan.id === "premium" ? (
                    <Zap className={`w-6 h-6 ${plan.id === "premium" ? "text-primary" : "text-amber-500"}`} />
                  ) : (
                    <Crown className="w-6 h-6 text-amber-500" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-lg">
                    {plan.name === "Premium" ? (
                      <span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-transparent">
                        Premium
                      </span>
                    ) : (
                      <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
                        VIP
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cycle === "monthly" ? "Theo tháng" : "Theo năm"}
                  </div>
                </div>
              </div>

              {/* Pricing breakdown */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Giá gốc</span>
                  <span>{formatVND(order.basePrice)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-emerald-500">
                    <span>Giảm giá (yêu thích)</span>
                    <span>-{formatVND(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span>{order.vat === 0 ? "Miễn phí" : formatVND(order.vat)}</span>
                </div>
                <div className="border-t border-border pt-2 mt-2" />
                {!!paymentOrder?.proration_credit && (
                  <div className="flex justify-between text-emerald-500">
                    <span>Khấu trừ thời gian còn lại</span>
                    <span>-{formatVND(paymentOrder.proration_credit)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg">
                  <span>Tổng cộng</span>
                  <span className="text-primary">{formatVND(paymentOrder?.amount ?? order.total)}</span>
                </div>
              </div>

              {/* Cycle toggle */}
              <div className="mt-4 p-3 rounded-lg bg-card border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Chu kỳ</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/checkout?plan=${plan.id}&cycle=monthly`)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        cycle === "monthly"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      Theo tháng
                    </button>
                    <button
                      onClick={() => router.push(`/checkout?plan=${plan.id}&cycle=yearly`)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 ${
                        cycle === "yearly"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      Theo năm
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 text-[10px] font-bold">
                        -17%
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Validity */}
              <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400">
                <div className="flex items-center gap-1.5 mb-1">
                  <Check className="w-3.5 h-3.5" />
                  <span className="font-semibold">Đăng ký thành công!</span>
                </div>
                <p>
                  Hiệu lực từ <strong>{order.startsAt}</strong> đến{" "}
                  <strong>{order.expiresAt}</strong>
                </p>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
