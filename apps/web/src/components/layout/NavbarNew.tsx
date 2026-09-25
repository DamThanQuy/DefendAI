"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { clearSession } from "@/lib/auth";
import { isPublicPath } from "@/lib/shell";
import { GraduationCap, Bell, Search, Settings } from "lucide-react";

const navLinks: { href: string; label: string; roles?: string[]; public?: boolean }[] = [
  { href: "/", label: "Trang chủ", public: true },
  { href: "/pricing", label: "Bảng giá", public: true },
  { href: "/demo", label: "Xem demo", public: true },
  { href: "/documents", label: "Tài liệu" },
  { href: "/workspaces", label: "Workspace" },
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
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg transition-all">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 group transition-transform hover:scale-[1.02]"
        >
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/30 overflow-hidden">
            <Image
              src="/avatar.jpg"
              alt="GraduAI"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xl font-extrabold tracking-tight">
              <span className="text-gradient">Gradu</span>
              <span className="text-foreground">AI</span>
            </span>
            <span className="text-[9px] font-semibold tracking-[0.18em] text-muted-foreground mt-0.5">
              MOCK DEFENSE
            </span>
          </div>
        </Link>

        {/* Search bar */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Tìm kiếm..."
              className="w-full pl-10 pr-4 py-2 rounded-full bg-muted/50 border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all text-sm"
            />
          </div>
        </div>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks
            .filter((link) => link.public)
            .map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
        </nav>

        {/* Right CTAs */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Bell className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Settings className="w-5 h-5" />
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Link href="/profile/avatar">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center cursor-pointer overflow-hidden">
                  <Image
                    src={user.avatar || "/avatar.jpg"}
                    alt="Avatar"
                    width={36}
                    height={36}
                    className="w-full h-full object-cover"
                  />
                </div>
              </Link>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="rounded-full"
              >
                <GraduationCap className="w-4 h-4 mr-2" />
                Đăng xuất
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" className="rounded-full">
                  Đăng nhập
                </Button>
              </Link>
              <Link href="/register">
                <Button className="rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/30 transition-all">
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
