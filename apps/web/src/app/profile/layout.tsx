"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  History,
  Trophy,
  Users,
  CreditCard,
  Settings,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type SubLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: string;
};

const SUB_LINKS: SubLink[] = [
  { href: "/profile", label: "Tổng quan", icon: LayoutDashboard, section: "Khu vực của tôi" },
  { href: "/profile/history", label: "Lịch sử & Hiệu suất", icon: History, section: "Khu vực của tôi" },
  { href: "/profile/achievements", label: "Thành tích & Xếp hạng", icon: Trophy, section: "Khu vực của tôi" },
  { href: "/profile/peers", label: "Bạn học", icon: Users, section: "Khu vực của tôi" },
  { href: "/profile/billing", label: "Gói & Giao dịch", icon: CreditCard, section: "Khu vực của tôi" },
  { href: "/profile/settings", label: "Cài đặt", icon: Settings, section: "Tài khoản" },
];

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const isActive = (href: string) =>
    pathname === href || (href !== "/profile" && pathname.startsWith(`${href}/`));

  // Group by section
  const grouped: { section: string; items: SubLink[] }[] = [];
  for (const l of SUB_LINKS) {
    const last = grouped[grouped.length - 1];
    if (last && last.section === l.section) last.items.push(l);
    else grouped.push({ section: l.section!, items: [l] });
  }

  const initials = (user?.full_name || user?.email || "U")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Sub-sidebar (Qiz HUB style) */}
      <aside className="dark-card rounded-2xl p-5 lg:sticky lg:top-24 lg:self-start">
        {/* User info */}
        <Link
          href="/profile"
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50 transition-colors mb-4"
        >
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground font-bold shadow-md">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground truncate">
              {user?.full_name || "Sinh viên"}
            </p>
            <p className="text-[11px] text-muted-foreground">Thành viên</p>
          </div>
        </Link>

        {/* Nav */}
        <nav className="space-y-5">
          {grouped.map((g, gi) => (
            <div key={gi} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {g.section}
              </p>
              {g.items.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <l.icon
                      className={`w-[18px] h-[18px] shrink-0 transition-transform ${
                        active ? "scale-110" : "group-hover:scale-105"
                      }`}
                    />
                    {l.label}
                    {active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Help card */}
        <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 border border-primary/20">
          <div className="w-9 h-9 rounded-lg bg-primary/20 text-primary flex items-center justify-center mb-2">
            <GraduationCap className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-foreground mb-1">Cần hỗ trợ?</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
            Đội ngũ GraduAI luôn sẵn sàng giúp bạn.
          </p>
          <Link
            href="#"
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Liên hệ ngay →
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}