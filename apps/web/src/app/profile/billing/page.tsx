"use client";

import React from "react";
import Link from "next/link";
import { CreditCard, Crown, ArrowRight, ArrowLeft, Check } from "lucide-react";

export default function BillingPage() {
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
              <Crown className="w-5 h-5 text-accent" />
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Gói hiện tại
              </span>
            </div>
            <h2 className="text-4xl font-serif font-black mb-2">Free</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              Bạn đang dùng gói miễn phí. Nâng cấp để mở khóa tính năng cao cấp
              và luyện tập không giới hạn.
            </p>
          </div>
          <Link
            href="/checkout?plan=premium&cycle=monthly"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-primary-foreground rounded-full text-sm font-bold shadow-[0_0_20px_hsl(var(--primary)/0.45)] hover:brightness-110 transition-all shrink-0"
          >
            Nâng cấp ngay
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Benefits */}
      <div className="dark-card rounded-2xl p-6">
        <h3 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-500" />
          Quyền lợi khi nâng cấp Premium/VIP
        </h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          {[
            "Upload không giới hạn đồ án",
            "Mock defense không giới hạn",
            "Phân tích code chuyên sâu",
            "Đánh giá theo rubric chi tiết",
            "Tạo câu hỏi phản biện không giới hạn",
            "Hỗ trợ ưu tiên 24/7",
          ].map((b) => (
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