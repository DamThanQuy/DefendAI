"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { clearSession } from "@/lib/auth";
import { isPublicPath } from "@/lib/shell";
import { GraduationCap } from "lucide-react";

const navLinks: { href: string; label: string; roles?: string[]; public?: boolean }[] = [
  { href: "/", label: "Trang chủ", public: true },
  { href: "/pricing", label: "Bảng giá", public: true },
  { href: "/demo", label: "Xem demo", public: true },
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
    clearSession();
    window.dispatchEvent(new Event("storage"));
    router.push("/login");
  }

  if (!isPublicPath(pathname)) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 backdrop-blur-md transition-all">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        {/* Logo — Qiz HUB style */}
        <Link
          href="/"
          className="flex items-center gap-3 group transition-transform hover:scale-[1.02]"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary)/0.35)]">
            <GraduationCap className="w-5 h-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xl font-extrabold tracking-tight">
              <span className="text-gradient">Gradu</span>
              <span className="text-foreground">AI</span>
            </span>
            <span className="text-[10px] font-semibold tracking-[0.18em] text-muted-foreground mt-0.5">
              MOCK DEFENSE PLATFORM
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1 text-sm font-medium h-full">
          {navLinks
            .filter((link) => link.public)
            .map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center px-4 h-10 rounded-full transition-all ${
                    isActive
                      ? "text-primary bg-primary/10 font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
        </nav>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
                {user.full_name || user.email}
              </span>
              <Link href="/documents">
                <Button className="rounded-full bg-primary hover:bg-primary/90 active:scale-[0.98] shadow-[0_0_15px_hsl(var(--primary)/0.35)] transition-all">
                  Dashboard
                </Button>
              </Link>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="rounded-full transition-all hover:bg-muted"
              >
                Đăng xuất
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Đăng nhập
              </Link>
              <Link href="/register">
                <Button className="rounded-full bg-primary hover:bg-primary/90 active:scale-[0.98] shadow-[0_0_15px_hsl(var(--primary)/0.35)] transition-all">
                  Đăng ký
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}