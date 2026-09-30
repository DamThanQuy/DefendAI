"use client";

import React, { useState, useEffect, useRef } from "react";
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
  QrCode,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Smartphone,
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
import { fetchPlans } from "@/app/pricing/pricing-api";
import { PLANS } from "@/app/pricing/pricing-data";
import { setMembershipPlan } from "@/lib/mock-ai-data";
import { toast } from "sonner";

type CheckoutPlan = { id: string; name: string; monthly: number; yearly: number };

type OrderResponse = {
  success: boolean;
  orderCode: number;
  amount: number;
  description: string;
  checkoutUrl?: string;
  qrCode?: string;
  qrImageUrl?: string;
  accountName?: string;
  accountNumber?: string;
  bin?: string;
  status: string;
  isSandbox?: boolean;
};

export default function CheckoutClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const planId = searchParams.get("plan") || "premium";
  const cycle = (searchParams.get("cycle") || "monthly") as "monthly" | "yearly";

  const [plan, setPlan] = useState<CheckoutPlan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>("payos");
  const [isCreatingOrder, setIsCreatingOrder] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // PayOS Order details
  const [orderData, setOrderData] = useState<OrderResponse | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"PENDING" | "PAID" | "EXPIRED">("PENDING");

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch plan info with fallback
  useEffect(() => {
    const rawId = (planId || "").toLowerCase();
    const staticPlan =
      PLANS.find(
        (p) =>
          p.id.toLowerCase() === rawId ||
          p.name.toLowerCase() === rawId ||
          (rawId.includes("vip") && p.id === "vip") ||
          (rawId.includes("100003") && p.id === "vip") ||
          (rawId.includes("premium") && p.id === "premium") ||
          (rawId.includes("100002") && p.id === "premium")
      ) || PLANS[1]; // default to premium

    fetchPlans()
      .then((plans) => {
        const selected = plans.find(
          (item) =>
            item.id === planId ||
            item.name.toLowerCase() === rawId ||
            (rawId === "vip" && (item.id === "100003" || item.name.toLowerCase() === "vip")) ||
            (rawId === "premium" && (item.id === "100002" || item.name.toLowerCase() === "premium")) ||
            (rawId === "free" && (item.id === "100001" || item.name.toLowerCase() === "free"))
        );
        if (selected) {
          setPlan({
            id: selected.id,
            name: selected.name,
            monthly: selected.monthly,
            yearly: selected.yearly,
          });
        } else {
          setPlan({
            id: staticPlan.id,
            name: staticPlan.name,
            monthly: staticPlan.monthly,
            yearly: staticPlan.yearly,
          });
        }
      })
      .catch(() => {
        setPlan({
          id: staticPlan.id,
          name: staticPlan.name,
          monthly: staticPlan.monthly,
          yearly: staticPlan.yearly,
        });
      });
  }, [planId]);

  // Create payment order via API
  useEffect(() => {
    if (!plan) return;

    let isMounted = true;
    setIsCreatingOrder(true);
    setErrorMsg("");

    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    const normalizedPlanId =
      plan.name.toLowerCase() === "vip" || plan.id === "100003" || plan.id === "vip"
        ? "vip"
        : plan.name.toLowerCase() === "premium" || plan.id === "100002" || plan.id === "premium"
        ? "premium"
        : plan.id;

    fetch("/api/payment/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        plan_id: normalizedPlanId,
        cycle: cycle,
        method: selectedMethod,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (isMounted) {
          if (data.orderCode) {
            setOrderData(data);
            setPaymentStatus((data.status as any) || "PENDING");
          } else if (data.status === "PAID") {
            handlePaymentSuccess(data.orderCode || 0);
          } else {
            setErrorMsg(data.message || data.error || "Không thể tạo mã thanh toán.");
          }
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMsg("Lỗi kết nối khi tạo đơn hàng. Đang sử dụng chế độ dự phòng.");
        }
      })
      .finally(() => {
        if (isMounted) setIsCreatingOrder(false);
      });

    return () => {
      isMounted = false;
    };
  }, [plan, cycle, selectedMethod]);

  // Auto-polling payment status
  useEffect(() => {
    if (!orderData?.orderCode || paymentStatus === "PAID") return;

    const checkStatus = async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
        const res = await fetch(`/api/payment/order-status/${orderData.orderCode}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const data = await res.json();

        if (data.status === "PAID") {
          handlePaymentSuccess(orderData.orderCode);
        }
      } catch (e) {}
    };

    pollIntervalRef.current = setInterval(checkStatus, 2500);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [orderData?.orderCode, paymentStatus]);

  const handlePaymentSuccess = (code: number) => {
    setPaymentStatus("PAID");
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    try {
      if (plan?.id === "vip" || plan?.id === "premium") {
        setMembershipPlan(plan.id);
      }
    } catch {}

    toast.success("Thanh toán thành công! Gói hội viên của bạn đã được kích hoạt.");

    setTimeout(() => {
      router.push(`/payment-success?plan=${plan?.id || "premium"}&cycle=${cycle}&order_id=${code}`);
    }, 1200);
  };

  const handleSandboxConfirm = async () => {
    if (!orderData?.orderCode) return;
    setIsConfirming(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`/api/payment/mock-confirm/${orderData.orderCode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.status === "PAID" || data.success) {
        handlePaymentSuccess(orderData.orderCode);
      } else {
        toast.error(data.message || "Không thể xác nhận thanh toán.");
      }
    } catch (e: any) {
      handlePaymentSuccess(orderData.orderCode);
    } finally {
      setIsConfirming(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(label);
    toast.success(`Đã sao chép ${label}!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        Đang tải thông tin gói...
      </div>
    );
  }

  const order = getOrderSummary(plan, cycle);
  const displayAmount = orderData?.amount || order.total;
  const displayOrderCode = orderData?.orderCode ? `DEFEND ${orderData.orderCode}` : `DEFEND-${Date.now()}`;
  const displayAccountName = orderData?.accountName || "NGUYEN THE BAO";
  const displayAccountNo = orderData?.accountNumber || "040060104";

  // If PayOS returned official EMVCo QR string, render it directly
  const qrImageUrl =
    orderData?.qrCode && orderData.qrCode.startsWith("000201")
      ? `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(orderData.qrCode)}`
      : orderData?.qrImageUrl ||
        `https://img.vietqr.io/image/970422-${displayAccountNo}-compact2.png?amount=${displayAmount}&addInfo=${encodeURIComponent(
          displayOrderCode
        )}&accountName=${encodeURIComponent(displayAccountName)}`;

  const getMethodIcon = (id: PaymentMethodId) => {
    switch (id) {
      case "payos":
        return <QrCode className="w-5 h-5" />;
      case "momo":
        return <span className="font-black text-xs">MoMo</span>;
      case "zalopay":
        return <Zap className="w-5 h-5" />;
      case "vnpay":
        return <span className="font-black text-xs">VNPAY</span>;
      case "card":
        return <CreditCard className="w-5 h-5" />;
      case "bank_transfer":
      default:
        return <Building2 className="w-5 h-5" />;
    }
  };

  const getMethodColor = (id: PaymentMethodId) => {
    switch (id) {
      case "payos":
        return "bg-emerald-600 text-white shadow-emerald-500/20";
      case "momo":
        return "bg-pink-600 text-white shadow-pink-500/20";
      case "zalopay":
        return "bg-blue-600 text-white shadow-blue-500/20";
      case "vnpay":
        return "bg-cyan-600 text-white shadow-cyan-500/20";
      case "card":
        return "bg-violet-600 text-white shadow-violet-500/20";
      case "bank_transfer":
      default:
        return "bg-indigo-600 text-white shadow-indigo-500/20";
    }
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
            Quay lại bảng giá
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-muted-foreground">Thanh toán PayOS bảo mật</span>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 lg:px-8 max-w-5xl py-8">
        {/* Page title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-4 h-4" />
            Cổng thanh toán sinh viên
          </div>
          <h1 className="text-3xl md:text-4xl font-serif font-black mb-2">
            Thanh toán đăng ký gói {plan.name}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Mở ứng dụng Ngân hàng (VietQR) quét mã QR bên dưới để kích hoạt tài khoản tự động.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Payment methods & QR */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3 space-y-6"
          >
            {/* Payment methods selection */}
            <Card className="p-6">
              <h2 className="text-base font-serif font-bold mb-4 flex items-center gap-2">
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
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40 bg-card"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 shadow-md ${getMethodColor(
                        method.id
                      )}`}
                    >
                      {getMethodIcon(method.id)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{method.name}</span>
                        {method.badge && (
                          <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-bold uppercase">
                            {method.badge}
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

            {/* PayOS / VietQR Dynamic QR Code Card */}
            <Card className="p-6 border-primary/40 bg-gradient-to-br from-card via-card to-primary/5 relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                    QR
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Mã QR Thanh Toán VietQR (PayOS)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Số tiền thanh toán: <strong className="text-primary">{formatVND(displayAmount)}</strong>
                    </p>
                  </div>
                </div>

                {/* Polling indicator */}
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Đang chờ thanh toán...
                </div>
              </div>

              {isCreatingOrder ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm">Đang tạo mã thanh toán PayOS...</p>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  {/* QR Image Box */}
                  <div className="flex flex-col items-center">
                    <div className="relative p-2.5 bg-white rounded-2xl shadow-xl border border-border/80 group">
                      <img
                        src={qrImageUrl}
                        alt="Mã QR thanh toán VietQR PayOS"
                        className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg"
                      />
                      {paymentStatus === "PAID" && (
                        <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center text-emerald-400 p-4 text-center">
                          <CheckCircle2 className="w-12 h-12 mb-2 animate-bounce" />
                          <p className="font-bold text-sm">Thanh toán thành công!</p>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 text-center flex items-center gap-1">
                      <Smartphone className="w-3 h-3" /> Mở app Ngân hàng bất kỳ để quét
                    </p>
                  </div>

                  {/* Transfer Details */}
                  <div className="flex-1 w-full space-y-3 text-sm">
                    <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Ngân hàng:</span>
                        <strong className="font-semibold text-foreground">MB Bank (VietQR)</strong>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Chủ tài khoản:</span>
                        <strong className="font-semibold text-foreground uppercase">{displayAccountName}</strong>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Số tài khoản:</span>
                        <div className="flex items-center gap-1.5">
                          <strong className="font-mono text-foreground font-bold">{displayAccountNo}</strong>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(displayAccountNo, "Số tài khoản")}
                            className="text-primary hover:opacity-80 p-0.5 rounded"
                            title="Sao chép số tài khoản"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Số tiền:</span>
                        <strong className="text-primary font-bold text-sm">{formatVND(displayAmount)}</strong>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/60">
                        <span className="text-muted-foreground">Nội dung CK:</span>
                        <div className="flex items-center gap-1.5">
                          <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
                            {displayOrderCode}
                          </strong>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(displayOrderCode, "Nội dung chuyển khoản")}
                            className="text-primary hover:opacity-80 p-0.5 rounded"
                            title="Sao chép nội dung"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* PayOS Direct Link button */}
                    {orderData?.checkoutUrl && orderData.checkoutUrl.startsWith("http") && (
                      <a
                        href={orderData.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:brightness-110 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Mở trang thanh toán PayOS trực tiếp
                      </a>
                    )}

                    {/* Sandbox simulation button */}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSandboxConfirm}
                      disabled={isConfirming || paymentStatus === "PAID"}
                      className="w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                    >
                      {isConfirming ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Đang kiểm tra & kích hoạt...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Tôi đã chuyển khoản / Kích hoạt gói ngay
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Error message */}
              {errorMsg && (
                <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}
            </Card>
          </motion.div>

          {/* Right: Order Summary */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 space-y-6"
          >
            <Card className="p-6">
              <h2 className="text-lg font-serif font-bold mb-4">Thông tin đơn hàng</h2>

              {/* Plan badge */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
                <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  {plan.id === "vip" ? <Crown className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-foreground">Gói {plan.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Thanh toán {cycle === "monthly" ? "theo tháng" : "theo năm"}
                  </p>
                </div>
              </div>

              <div className="space-y-3 text-sm border-b border-border/50 pb-4 mb-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Giá gốc:</span>
                  <span className="font-medium">{formatVND(order.basePrice)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Ưu đãi gói năm (17%):</span>
                    <span>-{formatVND(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT:</span>
                  <span className="text-muted-foreground">0đ</span>
                </div>
              </div>

              <div className="flex justify-between items-baseline mb-6">
                <span className="font-bold text-base">Tổng thanh toán:</span>
                <span className="text-2xl font-serif font-black text-primary">
                  {formatVND(displayAmount)}
                </span>
              </div>

              {/* Subscription details */}
              <div className="p-3.5 rounded-xl bg-muted/40 text-xs space-y-2 text-muted-foreground mb-4">
                <div className="flex justify-between">
                  <span>Ngày bắt đầu:</span>
                  <strong className="text-foreground">{order.startsAt}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Hạn sử dụng:</span>
                  <strong className="text-foreground">{order.expiresAt}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Tự động kích hoạt:</span>
                  <strong className="text-emerald-500 font-bold">Có (Tự động 24/7)</strong>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground text-center">
                Bằng việc thanh toán, bạn đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của DefendAI.
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
