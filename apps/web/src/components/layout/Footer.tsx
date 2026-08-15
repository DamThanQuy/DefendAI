"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/shell";

export function Footer() {
  const pathname = usePathname();
  // Trang app dùng sidebar (AppShell) — ẩn footer marketing để tránh trùng lặp.
  if (!isPublicPath(pathname)) return null;

  return (
    <footer className="bg-background border-t border-border py-8">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between px-4 lg:px-8 gap-6">
        <div className="flex-shrink-0">
          <Link href="/" className="text-2xl font-extrabold tracking-tighter">
            <span className="text-gradient">GraduAI</span>
          </Link>
        </div>

        <nav className="flex flex-wrap justify-center gap-8 text-sm text-muted-foreground font-medium">
          <Link href="#" className="hover:text-foreground transition-colors">Về chúng tôi</Link>
          <Link href="#" className="hover:text-foreground transition-colors">Điều khoản</Link>
          <Link href="#" className="hover:text-foreground transition-colors">Chính sách bảo mật</Link>
          <Link href="#" className="hover:text-foreground transition-colors">Liên hệ</Link>
        </nav>

        <div className="text-sm text-muted-foreground md:text-right">
          © {new Date().getFullYear()} GraduAI. Nền tảng hỗ trợ học thuật thông minh.
        </div>
      </div>
    </footer>
  );
}
