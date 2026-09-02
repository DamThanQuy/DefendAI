"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CreditCard,
  Smartphone,
  Building2,
  Check,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Crown,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PAYMENT_METHODS,
  BANK_LIST,
  getOrderSummary,
  formatVND,
  type PaymentMethodId,
} from "./payment-data";

function getPlanFromId(id: string): { id: "premium" | "vip"; name: string; monthly: number; yearly: number } | null {
  if (id === "premium") return { id: "premium", name: "Premium", monthly: 99000, yearly: 990000 };
  if (id === "vip") return { id: "vip", name: "VIP", monthly: 199000, yearly: 1990000 };
  return null;
}

export default function CheckoutClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const planId = searchParams.get("plan") || "premium";
  const cycle = (searchParams.get("cycle") || "monthly") as "monthly" | "yearly";

  const plan = getPlanFromId(planId);
  const [step, setStep] = useState<"payment" | "processing" | "done">("payment");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>("momo");
  const [showBankList, setShowBankList] = useState(false);
  const [selectedBank, setSelectedBank] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Redirect if no plan
  useEffect(() => {
    if (!plan) {
      router.replace("/pricing");
    }
  }, [plan, router]);

  if (!plan) return null;

  const order = getOrderSummary(plan, cycle);

  const handlePayment = async () => {
    if (selectedMethod === "bank_transfer" && !selectedBank) {
      setErrorMsg("Vui lòng chọn ngân hàng");
      return;
    }
    setIsLoading(true);
    setErrorMsg("");
    setStep("processing");

    // Simulate payment processing - in production, call backend API
    await new Promise((r) => setTimeout(r, 2000));

    // For demo: always succeed
    setStep("done");
    setIsLoading(false);
  };

  const getMethodIcon = (id: PaymentMethodId) => {
    if (id === "momo" || id === "zalopay" || id === "vnpay") return <Smartphone className="w-5 h-5" />;
    if (id === "bank_transfer") return <Building2 className="w-5 h-5" />;
    return <CreditCard className="w-5 h-5" />;
  };

  const getMethodColor = (id: PaymentMethodId) => {
    if (id === "momo") return "bg-pink-500 text-white";
    if (id === "zalopay") return "bg-blue-500 text-white";
    if (id === "vnpay") return "bg-red-500 text-white";
    if (id === "bank_transfer") return "bg-amber-500 text-white";
    return "bg-indigo-500 text-white";
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
                          if (method.id !== "bank_transfer") setShowBankList(false);
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

                {/* Bank list (shown when bank_transfer is selected) */}
                {selectedMethod === "bank_transfer" && (
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold mb-3">Chọn ngân hàng</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BANK_LIST.map((bank) => (
                        <button
                          key={bank.code}
                          onClick={() => {
                            setSelectedBank(bank.code);
                            setErrorMsg("");
                          }}
                          className={`p-3 rounded-lg border text-center text-xs font-medium transition-all ${
                            selectedBank === bank.code
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/40 bg-card"
                          }`}
                        >
                          {bank.name}
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

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
                  onClick={handlePayment}
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
                      Thanh toán {formatVND(order.total)}
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
                  <Link href="/payment-success">
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
                <div className="flex justify-between font-bold text-lg">
                  <span>Tổng cộng</span>
                  <span className="text-primary">{formatVND(order.total)}</span>
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
