"use client";

import React from "react";
import Link from "next/link";
import { Trophy, Award, Flame, ArrowLeft } from "lucide-react";

const BADGES = [
  { icon: "🎯", name: "Chuyên gia logic", desc: "Hoàn thành 5 mock đạt 9+", earned: true },
  { icon: "🚀", name: "Siêu tốc độ", desc: "Mock dưới 30 phút", earned: true },
  { icon: "💪", name: "Kiên trì", desc: "Chuỗi 7 ngày", earned: true },
  { icon: "📚", name: "Đa tài liệu", desc: "Upload 5 đồ án", earned: false },
  { icon: "🏆", name: "Top 10 tuần", desc: "Xếp hạng tuần này", earned: false },
  { icon: "👑", name: "VIP", desc: "Nâng cấp member VIP", earned: false },
];

export default function AchievementsPage() {
  const earnedCount = BADGES.filter((b) => b.earned).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-primary">
        <Trophy className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">
          Thành tích & Xếp hạng
        </span>
      </div>
      <div>
        <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
          Thành tích của bạn
        </h1>
        <p className="text-muted-foreground">
          Tích luỹ XP, mở khoá huy hiệu và so sánh với bạn học cùng ngành.
        </p>
      </div>

      {/* XP bar */}
      <div className="dark-card rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-accent/10 blur-[80px] rounded-full" />
        <div className="relative flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Cấp độ hiện tại</p>
            <p className="text-2xl font-serif font-black text-gradient">
              Cấp 5 — Luyện tập
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">XP</p>
            <p className="text-2xl font-bold">2,450</p>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary via-secondary to-accent"
            style={{ width: "65%" }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Còn 1,550 XP để lên Cấp 6 — Thành thạo
        </p>
      </div>

      {/* Badges grid */}
      <div className="dark-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-serif font-bold flex items-center gap-2">
            <Award className="w-5 h-5 text-accent" />
            Huy hiệu
          </h3>
          <span className="text-xs text-muted-foreground">
            {earnedCount}/{BADGES.length} đã đạt
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {BADGES.map((b) => (
            <div
              key={b.name}
              className={`dark-card rounded-2xl p-5 text-center transition-all ${
                b.earned ? "" : "opacity-40 grayscale"
              }`}
            >
              <div className="text-5xl mb-2">{b.icon}</div>
              <p className="font-bold text-sm mb-1">{b.name}</p>
              <p className="text-xs text-muted-foreground leading-snug">
                {b.desc}
              </p>
              {b.earned && (
                <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold">
                  <Flame className="w-3 h-3" />
                  Đã đạt
                </span>
              )}
            </div>
          ))}
        </div>
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