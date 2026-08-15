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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { isPublicPath } from "@/lib/shell";

/**
 * Shell cho các trang "app" (sau khi đăng nhập): sidebar trái + top bar mỏng.
 * Trang public/landing (/, /demo, /login, /register) KHÔNG dùng shell này —
 * giữ nguyên top nav marketing. Ngắt bằng usePathname.
 *
 * Menu mentor được gộp trực tiếp vào đây (thay vì dùng MentorLayout riêng)
 * để tránh 2 sidebar chồng nhau. Các mục có roles:["mentor"] chỉ hiện với mentor.
 */

const SIDEBAR_LINKS: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: string[] }[] = [
  // --- Tính năng sinh viên (không hiện với mentor) ---
  { href: "/documents", label: "Tài liệu", icon: FileText, roles: ["student", "admin"] },
  { href: "/workspaces", label: "Workspace", icon: FolderKanban, roles: ["student", "admin"] },
  { href: "/code-review", label: "Code Review", icon: Code2, roles: ["student", "admin"] },
  { href: "/bookings", label: "Đặt lịch", icon: CalendarClock, roles: ["student", "admin"] },
  { href: "/room", label: "Mock Room", icon: MonitorPlay, roles: ["student", "admin"] },
  { href: "/report", label: "Báo cáo", icon: BarChart3, roles: ["student", "admin"] },
  { href: "/admin", label: "Quản trị", icon: ShieldCheck, roles: ["admin"] },
  // --- Mentor section (chỉ hiện với role mentor) ---
  { href: "/mentor/dashboard", label: "Tổng quan Mentor", icon: LayoutDashboard, roles: ["mentor", "admin"] },
  { href: "/mentor/calendar", label: "Lịch rảnh", icon: CalendarDays, roles: ["mentor", "admin"] },
  { href: "/mentor/bookings", label: "Quản lý lịch", icon: CalendarClock, roles: ["mentor", "admin"] },
  { href: "/mentor/sessions", label: "Lịch sử Mentor", icon: Video, roles: ["mentor", "admin"] },
  { href: "/mentor/profile", label: "Hồ sơ cá nhân", icon: User, roles: ["mentor", "admin"] },
  { href: "/mentor/reviews", label: "Đánh giá học viên", icon: Star, roles: ["mentor", "admin"] },
  { href: "/mentor/wallet", label: "Ví & Thu nhập", icon: Wallet, roles: ["mentor", "admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, hasRole } = useAuth();

  // Trang public → không bọc sidebar
  if (isPublicPath(pathname)) {
    return <>{children}</>;
  }

  function handleLogout() {
    clearSession();
    window.dispatchEvent(new Event("storage")); // useAuth tự reset
    window.location.href = "/login";
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-60 border-r border-border bg-background/95 backdrop-blur-sm flex flex-col">
        {/* Logo */}
        <Link href="/" className="h-16 flex items-center gap-2 px-5 border-b border-border shrink-0">
          <span className="text-xl font-extrabold tracking-tighter text-gradient">GraduAI</span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {SIDEBAR_LINKS.filter(
            (l) => !l.roles || l.roles.some((r) => hasRole(r)),
          ).map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-teal-500/10 text-teal-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <l.icon className="w-[18px] h-[18px] shrink-0" />
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground truncate">
                {user?.full_name || user?.email}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleLogout}
            className="mt-2 w-full rounded-lg"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Đăng xuất
          </Button>
        </div>
      </aside>

      {/* Main: top bar + content */}
      <div className="flex-1 ml-60 min-w-0">
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-sm flex items-center px-6 gap-4">
          {/* Breadcrumb */}
          <nav className="flex items-center text-[13px] text-muted-foreground font-medium gap-1.5 min-w-0">
            <Link href="/documents" className="hover:text-foreground transition-colors shrink-0">Trang chủ</Link>
            <span className="text-muted-foreground/60">›</span>
            <span className="text-teal-400 font-semibold truncate">
              {SIDEBAR_LINKS.find((l) => isActive(l.href))?.label ?? "Ứng dụng"}
            </span>
          </nav>
        </header>
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
