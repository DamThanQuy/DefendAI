"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  XCircle,
  ArrowLeft,
  RefreshCw,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-background to-amber-500/5" />
      <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-red-500/10 blur-[80px] rounded-full" />

      <div className="relative w-full max-w-2xl text-center">
        {/* Cancel icon */}
        <motion.div
          initial={{ scale: 0, rotate: 180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 0.7 }}
          className="mb-8"
        >
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-500/20 border-4 border-red-500/30 mb-4">
            <XCircle className="w-14 h-14 text-red-500" />
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl md:text-5xl font-serif font-black mb-3"
          >
            Thanh toán đã bị hủy
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground text-lg"
          >
            Không có khoản phí nào được thực hiện. Bạn có thể thử lại bất cứ lúc nào.
          </motion.p>
        </motion.div>

        {/* Info card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="p-6 md:p-8 mb-6 text-left">
            <h3 className="text-lg font-serif font-bold mb-4">
              Bạn có thể thử lại bằng cách:
            </h3>
            <ul className="space-y-3 text-sm">
              {[
                "Chọn phương thức thanh toán khác",
                "Kiểm tra số dư tài khoản hoặc thẻ",
                "Đảm bảo kết nối internet ổn định",
                "Liên hệ hỗ trợ nếu vấn đề vẫn tiếp diễn",
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{tip}</span>
                </li>
              ))}
            </ul>
          </Card>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Link href="/checkout" className="flex-1">
            <Button className="w-full h-12 rounded-xl text-base font-semibold shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:brightness-110 group">
              <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-180 transition-transform" />
              Thử lại thanh toán
            </Button>
          </Link>
          <Link href="/pricing" className="flex-1">
            <Button variant="outline" className="w-full h-12 rounded-xl text-base font-semibold">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Quay lại bảng giá
            </Button>
          </Link>
        </motion.div>

        {/* Support */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8"
        >
          <Card className="p-6 bg-card/80 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground mb-3">
              Gặp sự cố khi thanh toán?
            </p>
            <Link
              href="mailto:support@defendai.dev"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <MessageCircle className="w-4 h-4" />
              Liên hệ hỗ trợ
            </Link>
          </Card>
        </motion.div>

        {/* Trust footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Thông tin thanh toán của bạn được bảo mật
        </motion.div>
      </div>
    </div>
  );
}
