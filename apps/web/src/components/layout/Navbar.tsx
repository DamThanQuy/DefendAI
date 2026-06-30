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
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="container mx-auto flex h-[72px] items-center justify-between px-4 lg:px-8">
        <Link href="/" className="text-[22px] font-extrabold text-[#0f2e82] tracking-tight">
          GraduAI
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium h-full">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative flex items-center h-full transition-colors ${
                  isActive ? "text-[#0f2e82] font-semibold" : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {link.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 w-full h-[3px] bg-[#0f2e82] rounded-t-full" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-semibold text-[#0f2e82] hover:text-[#0f2e82]/80 transition-colors">
            Đăng nhập
          </Link>
          <Link href="/register">
            <Button className="bg-[#0f2e82] hover:bg-[#0f2e82]/90 text-white font-medium rounded-md px-6 h-10 shadow-sm">
              Bắt đầu
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
