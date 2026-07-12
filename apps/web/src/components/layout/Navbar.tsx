"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/", label: "Trang chủ" },
  { href: "/upload", label: "Tải tài liệu" },
  { href: "/questions", label: "Kết quả AI" },
  { href: "/code-review", label: "Code Review" },
  { href: "/room", label: "Mock Room" },
  { href: "/report", label: "Báo cáo" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="bg-background/80 backdrop-blur-md border-b border-border sticky top-0 z-50">
      <div className="container mx-auto flex h-[72px] items-center justify-between px-4 lg:px-8">
        <Link href="/" className="text-[22px] font-extrabold text-teal-400 tracking-tight">
          Gradu<span className="text-foreground">AI</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium h-full">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center h-full transition-colors duration-200 ${
                  isActive ? "text-teal-400 font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 w-full h-[3px] bg-teal-500 rounded-t-full shadow-glow" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-semibold text-teal-400 hover:brightness-110 transition-all duration-200">
            Đăng nhập
          </Link>
          <Link href="/register">
            <Button className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-medium rounded-md px-6 h-10 hover:brightness-110 active:scale-[0.98] shadow-glow transition-all duration-200">
              Bắt đầu
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
