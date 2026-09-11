"use client";

import { motion } from "framer-motion";
import { Crown, Lock, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMembershipPlan } from "./mentor-data";

/**
 * ─────────────────────────────────────────────────────────────
 *  VipGate — Màn hình khóa cho người dùng chưa đăng ký VIP.
 *
 *  Kiểm tra localStorage membership_plan === "vip".
 *  Nếu chưa phải VIP → hiển thị overlay khóa.
 *  Khi có backend: thay getMembershipPlan bằng API /api/me/membership.
 * ─────────────────────────────────────────────────────────────
 */

interface VipGateProps {
  children: React.ReactNode;
}

export function VipGate({ children }: VipGateProps) {
  const plan = getMembershipPlan();
  const isVip = plan === "vip";

  if (isVip) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-primary/20 via-secondary/10 to-accent/10 blur-[120px] rounded-full -z-10" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-2xl"
      >
        <Card className="border-2 border-dashed border-primary/30 bg-card/80">
          <div className="p-8 text-center">
            {/* Icon khóa */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", duration: 0.8, delay: 0.1 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-accent to-orange-500 mb-6 shadow-[0_0_30px_hsl(var(--accent)/0.4)]"
            >
              <Lock className="w-10 h-10 text-white" />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-3xl md:text-4xl font-serif font-black mb-3"
            >
              <span className="text-gradient">Phòng Mentor AI</span>{" "}
              dành cho thành viên VIP
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-muted-foreground text-lg mb-6 max-w-md mx-auto"
            >
              Tính năng này chỉ dành cho gói thành viên Cao cấp (199.000đ/tháng)
              với phòng Mentor AI trực tuyến 24/7.
            </motion.p>

            {/* Lợi ích VIP */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8"
            >
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm">Phòng Mentor AI 24/7</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm">3 mentor chuyên biệt</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm">Luyện chất vấn thực chiến</span>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm">Lưu trữ không giới hạn</span>
              </div>
            </motion.div>

            {/* CTA nâng cấp */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                size="lg"
                className="px-8 py-3 text-lg font-bold group"
                onClick={() => {
                  window.location.href = "/checkout?plan=vip&cycle=monthly";
                }}
              >
                <Crown className="w-5 h-5 mr-2" />
                Nâng cấp ngay 199.000đ/tháng
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>

            {/* Link quay lại pricing */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-sm text-muted-foreground mt-4"
            >
              Hoặc{" "}
              <a
                href="/pricing"
                className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
              >
                xem tất cả gói thành viên
              </a>
            </motion.p>
          </div>
        </Card>

        {/* Badge VIP góc trên phải */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", delay: 0.3 }}
          className="absolute -top-3 -right-3 bg-gradient-to-r from-accent to-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-[0_0_12px_hsl(var(--accent)/0.5)] flex items-center gap-1"
        >
          <Sparkles className="w-3 h-3" />
          VIP ONLY
        </motion.div>
      </motion.div>
    </div>
  );
}
