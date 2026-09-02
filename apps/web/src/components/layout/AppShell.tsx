"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { clearSession } from "@/lib/auth";
import {
  FileText,
  FolderKanban,
  Code2,
  MonitorPlay,
  BarChart3,
  ShieldCheck,
  LogOut,
  CalendarClock,
  LayoutDashboard,
  CalendarDays,
  Video,
  User,
  Star,
  Wallet,
  Users,
  Settings,
  Scale,
  Bot,
  Crown,
  GraduationCap,
  HelpCircle,
  Bell,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPublicPath } from "@/lib/shell";
import { UserMenu } from "./UserMenu";

/**
 * Shell cho các trang "app" (sau khi đăng nhập): sidebar trái + top bar.
 * Trang public/landing (/, /demo, /login, /register) KHÔNG dùng shell này.
 *
 * Style: đồng bộ với landing/pricing — teal/cyan + serif headers + cards.
 * Mentor menu gộp vào đây để tránh 2 sidebar chồng nhau.
 */

type SidebarLink = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  section?: string;
};

const SIDEBAR_LINKS: SidebarLink[] = [
  // --- Tính năng sinh viên ---
  { href: "/documents", label: "Tài liệu", icon: FileText, roles: ["student", "admin"] },
  { href: "/workspaces", label: "Workspace", icon: FolderKanban, roles: ["student", "admin"] },
  { href: "/code-review", label: "Code Review", icon: Code2, roles: ["student", "admin"] },
  { href: "/bookings", label: "Đặt lịch", icon: CalendarClock, roles: ["student", "admin"] },
  { href: "/mock-room", label: "Mock Room", icon: MonitorPlay, roles: ["student", "admin"] },
  { href: "/report", label: "Báo cáo", icon: BarChart3, roles: ["student", "admin"] },
  { href: "/pricing", label: "Đăng ký Member", icon: Crown, roles: ["student", "admin"] },
  // --- Mentor ---
  { href: "/mentor/dashboard", label: "Tổng quan Mentor", icon: LayoutDashboard, roles: ["mentor", "admin"] },
  { href: "/mentor/calendar", label: "Lịch rảnh", icon: CalendarDays, roles: ["mentor", "admin"] },
  { href: "/mentor/bookings", label: "Quản lý lịch", icon: CalendarClock, roles: ["mentor", "admin"] },
  { href: "/mentor/sessions", label: "Lịch sử Mentor", icon: Video, roles: ["mentor", "admin"] },
  { href: "/mentor/profile", label: "Hồ sơ cá nhân", icon: User, roles: ["mentor", "admin"] },
  { href: "/mentor/reviews", label: "Đánh giá học viên", icon: Star, roles: ["mentor", "admin"] },
  { href: "/mentor/wallet", label: "Ví & Thu nhập", icon: Wallet, roles: ["mentor", "admin"] },
  // --- Admin ---
  { href: "/admin/overview", label: "Tổng quan", icon: LayoutDashboard, roles: ["admin"], section: "Quản trị" },
  { href: "/admin/mentor-verification", label: "Duyệt Mentor", icon: Star, roles: ["admin"], section: "Quản trị" },
  { href: "/admin/dispute", label: "Dispute Center", icon: Scale, roles: ["admin"], section: "Quản trị" },
  { href: "/admin/payout", label: "Tài chính & Rút tiền", icon: Wallet, roles: ["admin"], section: "Quản trị" },
  { href: "/admin/users", label: "Quản lý người dùng", icon: Users, roles: ["admin"], section: "Quản trị" },
  { href: "/admin/settings", label: "Cấu hình hệ thống", icon: Settings, roles: ["admin"], section: "Quản trị" },
  { href: "/admin/moderation", label: "Kiểm duyệt nội dung", icon: ShieldCheck, roles: ["admin"], section: "Quản trị" },
  { href: "/admin/ai-monitor", label: "Giám sát AI", icon: Bot, roles: ["admin"], section: "Quản trị" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, hasRole } = useAuth();

  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  function handleLogout() {
    clearSession();
    window.dispatchEvent(new Event("storage"));
    window.location.href = "/login";
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const isAdmin = hasRole("admin");
  const visibleLinks = SIDEBAR_LINKS.filter((l) =>
    isAdmin
      ? l.roles?.length === 1 && l.roles[0] === "admin"
      : !l.roles || l.roles.some((r) => hasRole(r)),
  );

  const grouped: { section: string | undefined; items: SidebarLink[] }[] = [];
  for (const l of visibleLinks) {
    const last = grouped[grouped.length - 1];
    if (last && last.section === l.section) last.items.push(l);
    else grouped.push({ section: l.section, items: [l] });
  }

  const activeLabel =
    SIDEBAR_LINKS.find((l) => isActive(l.href))?.label ?? "Ứng dụng";

  return (
    <div className="min-h-screen flex bg-background">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,hsla(173,80%,40%,0.06),transparent_50%)]" />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-card/60 backdrop-blur-md flex flex-col">
        {/* Logo */}
        <Link
          href="/"
          className="h-16 flex items-center gap-3 px-5 border-b border-border shrink-0 group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[0_0_18px_hsl(var(--primary)/0.4)] group-hover:scale-105 transition-transform">
            <GraduationCap className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-lg font-extrabold tracking-tight">
              <span className="text-gradient">Gradu</span>
              <span className="text-foreground">AI</span>
            </span>
            <span className="text-[9px] font-semibold tracking-[0.18em] text-muted-foreground mt-0.5">
              MOCK DEFENSE
            </span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-5">
          {grouped.map((g, gi) => (
            <div key={g.section ?? `g-${gi}`} className="space-y-1">
              {g.section && (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {g.section}
                </p>
              )}
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

        {/* User footer — just the upgrade CTA, avatar moved to top bar */}
        <div className="border-t border-border p-3 shrink-0 bg-background/40">
          <Link
            href="/pricing"
            className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-primary/10 via-secondary/5 to-accent/10 border border-primary/20 hover:border-primary/40 transition-colors"
          >
            <Crown className="w-5 h-5 text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-foreground">Nâng cấp Member</p>
              <p className="text-[10px] text-muted-foreground">Mở khóa tính năng VIP</p>
            </div>
            <span className="text-primary text-xs">→</span>
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 ml-64 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-6 gap-4">
          {/* Breadcrumb */}
          <nav className="flex items-center text-[13px] font-medium gap-1.5 min-w-0">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              Trang chủ
            </Link>
            <span className="text-muted-foreground/50">›</span>
            <span className="text-primary font-semibold truncate">{activeLabel}</span>
          </nav>

          {/* Search-like spacer (visual match with landing hero) */}
          <div className="hidden lg:flex flex-1 max-w-md mx-auto items-center gap-2 h-10 px-4 rounded-full border border-border bg-card/60 text-sm text-muted-foreground">
            <Search className="w-4 h-4" />
            <span className="text-xs">Tìm tài liệu, workspace...</span>
            <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-muted"
              aria-label="Trợ giúp"
            >
              <HelpCircle className="w-5 h-5 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-muted relative"
              aria-label="Thông báo"
            >
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent)/0.8)]" />
            </Button>
            <UserMenu />
          </div>
        </header>

        <main className="p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </div>
  );
}