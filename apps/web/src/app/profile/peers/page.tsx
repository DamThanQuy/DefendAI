"use client";

import React from "react";
import Link from "next/link";
import { Users, UserPlus, ArrowLeft, Flame } from "lucide-react";

const PEERS = [
  { name: "Nguyễn Văn A", school: "FPT", xp: 3200, streak: 14 },
  { name: "Trần Thị B", school: "FPT", xp: 2900, streak: 9 },
  { name: "Lê Văn C", school: "UEH", xp: 2750, streak: 7 },
  { name: "Phạm Thị D", school: "DNTU", xp: 2400, streak: 5 },
  { name: "Hoàng Văn E", school: "HCMUT", xp: 2100, streak: 3 },
];

export default function PeersPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-primary">
        <Users className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">
          Bạn học
        </span>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
            Bạn học
          </h1>
          <p className="text-muted-foreground">
            Kết nối và theo dõi tiến trình với bạn học cùng ngành.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold shadow-[0_0_15px_hsl(var(--primary)/0.4)] hover:brightness-110 transition-all shrink-0">
          <UserPlus className="w-4 h-4" />
          Mời bạn
        </button>
      </div>

      {/* Leaderboard */}
      <div className="dark-card rounded-2xl p-6">
        <h3 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
          <Flame className="w-5 h-5 text-accent" />
          Bảng xếp hạng tuần này
        </h3>
        <ul className="divide-y divide-border">
          {PEERS.map((p, idx) => (
            <li
              key={p.name}
              className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                  idx === 0
                    ? "bg-amber-500/15 text-amber-500"
                    : idx === 1
                      ? "bg-zinc-400/15 text-zinc-400"
                      : idx === 2
                        ? "bg-orange-500/15 text-orange-500"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {idx + 1}
              </div>
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground font-bold shrink-0">
                {p.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.school} · {p.xp.toLocaleString()} XP
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">Chuỗi</div>
                <div className="text-base font-bold text-accent">
                  🔥 {p.streak}
                </div>
              </div>
            </li>
          ))}
        </ul>
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