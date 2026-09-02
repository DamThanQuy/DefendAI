"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { clearSession } from "@/lib/auth";
import { isPublicPath } from "@/lib/shell";

const navLinks: { href: string; label: string; roles?: string[]; public?: boolean }[] = [
  { href: "/", label: "Trang chủ", public: true },
  { href: "/demo", label: "Xem demo", public: true },
  { href: "/pricing", label: "Bảng giá", public: true },
  { href: "/documents", label: "Tài liệu" },
  { href: "/workspaces", label: "Workspace" },
  { href: "/code-review", label: "Code Review" },
  { href: "/mock-room", label: "Mock Room" },
  { href: "/report", label: "Báo cáo" },
  { href: "/admin/overview", label: "Quản trị", roles: ["admin"] },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  function handleLogout() {
    // Xóa cả access_token + refresh_token + user — nếu không refresh token còn sống 7 ngày
    clearSession();
    window.dispatchEvent(new Event("storage")); // useAuth tự reset
    router.push("/login");
  }

  // Trang app dùng sidebar (AppShell) — ẩn top nav marketing để tránh trùng lặp.
  if (!isPublicPath(pathname)) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-sm transition-all">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        <Link href="/" className="text-2xl font-extrabold tracking-tighter flex items-center gap-2 transition-transform hover:scale-105">
          <span className="text-gradient">GraduAI</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium h-full">
          {navLinks
            .filter((link) => link.public)
            .map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center h-full transition-colors ${
                    isActive ? "text-teal-500 font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 w-full h-[2px] bg-teal-500 rounded-t-full shadow-[0_0_8px_rgba(20,184,166,0.4)]" />
                  )}
                </Link>
              );
            })}
        </nav>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <span className="hidden text-sm font-medium text-zinc-400 sm:inline">
                {user.full_name || user.email}
              </span>
              <Link href="/documents">
                <Button size="sm" className="rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:brightness-110 active:scale-[0.98] shadow-[0_0_15px_rgba(13,148,136,0.3)] transition-all">
                  Dashboard
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={handleLogout}
                className="rounded-full transition-all hover:scale-105 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Đăng xuất
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Đăng nhập
              </Link>
              <Link href="/register">
                <Button size="sm" className="rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:brightness-110 active:scale-[0.98] shadow-[0_0_15px_rgba(13,148,136,0.3)] transition-all">
                  Bắt đầu
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
