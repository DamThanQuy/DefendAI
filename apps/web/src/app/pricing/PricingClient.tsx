"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  X,
  ShieldCheck,
  ArrowRight,
  BadgeCheck,
  Star,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BillingCycle,
  PLANS,
  FAQS,
  Plan,
  formatVND,
  planIcon,
} from "./pricing-data";

export default function PricingClient() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/10 blur-[120px] rounded-full -z-10" />
      <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-accent/10 blur-[100px] rounded-full -z-10" />

      {/* Hero */}
      <section className="container mx-auto px-4 lg:px-8 pt-24 pb-16 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-6">
            <BadgeCheck className="w-4 h-4" />
            Bảng giá cho sinh viên
          </div>
          <h1 className="text-4xl md:text-6xl font-serif font-black tracking-tight mb-6 leading-tight">
            Chọn gói phù hợp với <br />
            <span className="text-gradient">hành trình bảo vệ đồ án</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Từ miễn phí đến đồng hành 1-1 cùng chuyên gia — chúng tôi có gói dành cho bạn.
          </p>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center justify-center mt-10"
        >
          <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-card/60 backdrop-blur-sm">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                cycle === "monthly"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Theo tháng
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                cycle === "yearly"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Theo năm
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold">
                -17%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mt-14 max-w-6xl mx-auto">
          {PLANS.map((plan, idx) => (
            <PlanCard key={plan.id} plan={plan} cycle={cycle} idx={idx} />
          ))}
        </div>

        {/* Trust bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Thanh toán bảo mật SSL
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Hoàn tiền trong 7 ngày
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Hủy bất kỳ lúc nào
          </div>
        </motion.div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto px-4 lg:px-8 py-16 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-3">
            Câu hỏi thường gặp
          </h2>
          <p className="text-muted-foreground">
            Mọi thắc mắc của bạn được giải đáp chi tiết.
          </p>
        </motion.div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const open = openFaq === idx;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
              >
                <button
                  onClick={() => setOpenFaq(open ? null : idx)}
                  className="w-full text-left p-5 rounded-2xl border border-border bg-card/60 backdrop-blur-sm hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-semibold text-foreground">{faq.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <p className="pt-3 text-sm text-muted-foreground leading-relaxed">
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 lg:px-8 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-10 md:p-16 text-center"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.2),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-serif font-black mb-4">
              Sẵn sàng bảo vệ đồ án <br /> với sự tự tin tuyệt đối?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Hơn 5.000+ sinh viên đã tin tưởng GraduAI. Đăng ký ngay hôm nay.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              <Link href="/checkout?plan=premium">
                <Button className="rounded-full h-14 px-8 text-lg shadow-[0_0_20px_hsl(var(--primary)/0.5)] hover:brightness-110 group">
                  Bắt đầu với Premium
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" className="rounded-full h-14 px-8 text-lg">
                  Đã có tài khoản? Đăng nhập
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

function PlanCard({
  plan,
  cycle,
  idx,
}: {
  plan: Plan;
  cycle: BillingCycle;
  idx: number;
}) {
  const price = cycle === "monthly" ? plan.monthly : plan.yearly;
  const perMonth = cycle === "yearly" ? Math.round(plan.yearly / 12) : plan.monthly;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: idx * 0.1 }}
      whileHover={{ y: -8 }}
      className="relative"
    >
      {plan.featured && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary/30">
            <Star className="w-3.5 h-3.5 fill-current" />
            {plan.badge}
          </div>
        </div>
      )}
      <Card
        className={`h-full p-8 flex flex-col ${
          plan.featured
            ? "border-2 border-primary bg-gradient-to-b from-primary/5 via-card to-card shadow-2xl shadow-primary/20"
            : "bg-card/60 backdrop-blur-sm"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              plan.featured
                ? "bg-primary text-primary-foreground"
                : plan.id === "vip"
                  ? "bg-amber-500/20 text-amber-500"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {planIcon(plan.icon)}
          </div>
          <div>
            <h3 className="text-2xl font-bold font-serif">{plan.name}</h3>
            <p className="text-xs text-muted-foreground">{plan.tagline}</p>
          </div>
        </div>

        {/* Price */}
        <div className="mt-6 mb-8">
          {price === 0 ? (
            <div>
              <div className="text-5xl font-black font-serif">Miễn phí</div>
              <div className="text-sm text-muted-foreground mt-2">
                Sử dụng ngay, không cần thẻ
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black font-serif">
                  {formatVND(perMonth)}
                </span>
                <span className="text-muted-foreground text-sm">/tháng</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2 h-4">
                {cycle === "yearly" ? (
                  <>
                    Thanh toán {formatVND(price)} / năm
                    <span className="ml-2 line-through opacity-50">
                      {formatVND(plan.monthly * 12)}
                    </span>
                  </>
                ) : (
                  <>Thanh toán {formatVND(price)} / tháng</>
                )}
              </div>
            </div>
          )}
        </div>

        {/* CTA */}
        <Link href={`/checkout?plan=${plan.id}&cycle=${cycle}`} className="w-full">
          <Button
            className={`w-full rounded-full h-12 font-semibold ${
              plan.featured
                ? "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:brightness-110"
                : plan.id === "vip"
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:brightness-110"
                  : ""
            }`}
            variant={plan.featured || plan.id === "vip" ? "default" : "outline"}
          >
            {plan.cta}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>

        {/* Features */}
        <ul className="mt-8 space-y-3 flex-1">
          {plan.features.map((feat, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              {feat.included ? (
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    feat.highlight
                      ? "bg-primary text-primary-foreground"
                      : "bg-emerald-500/20 text-emerald-500"
                  }`}
                >
                  <Check className="w-3 h-3" strokeWidth={3} />
                </div>
              ) : (
                <div className="mt-0.5 w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <X className="w-3 h-3 text-muted-foreground" strokeWidth={3} />
                </div>
              )}
              <span
                className={
                  feat.included
                    ? feat.highlight
                      ? "font-semibold text-foreground"
                      : "text-foreground/90"
                    : "text-muted-foreground line-through"
                }
              >
                {feat.label}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </motion.div>
  );
}