"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const navLinks: { href: string; label: string; roles?: string[] }[] = [
  { href: "/", label: "Trang chủ" },
  { href: "/demo", label: "Xem demo" },
  { href: "/upload", label: "Tải tài liệu" },
  { href: "/questions", label: "Kết quả AI" },
  { href: "/code-review", label: "Code Review" },
  { href: "/room", label: "Mock Room" },
  { href: "/report", label: "Báo cáo" },
  { href: "/admin", label: "Quản trị", roles: ["admin"] },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hasRole } = useAuth();

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event("storage")); // useAuth tự reset
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/60 bg-background/80 backdrop-blur-sm transition-all">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        <Link href="/" className="text-2xl font-extrabold tracking-tighter flex items-center gap-2 transition-transform hover:scale-105">
          <span className="text-gradient">GraduAI</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium h-full">
          {navLinks
            .filter((link) => !link.roles || link.roles.some((r) => hasRole(r)))
            .map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative flex items-center h-full transition-colors ${
                    isActive ? "text-teal-400 font-semibold" : "text-zinc-400 hover:text-zinc-200"
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
              <Link href="/login" className="text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
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
