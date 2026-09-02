"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { isPublicPath } from "@/lib/shell";

export function Footer() {
  const pathname = usePathname();
  if (!isPublicPath(pathname)) return null;

  const product = [
    { href: "/", label: "Trang chủ" },
    { href: "/pricing", label: "Bảng giá" },
    { href: "/demo", label: "Xem demo" },
  ];
  const resources = [
    { href: "/documents", label: "Tài liệu" },
    { href: "/workspaces", label: "Workspace" },
    { href: "/code-review", label: "Code Review" },
    { href: "/mock-room", label: "Mock Room" },
  ];
  const company = [
    { href: "#", label: "Về chúng tôi" },
    { href: "#", label: "Liên hệ" },
    { href: "#", label: "Điều khoản" },
    { href: "#", label: "Chính sách bảo mật" },
  ];

  return (
    <footer className="border-t border-border bg-card/30 mt-16">
      <div className="container mx-auto px-4 lg:px-8 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[0_0_20px_hsl(var(--primary)/0.3)]">
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
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs">
              Nền tảng AI hỗ trợ sinh viên bảo vệ đồ án tự tin với hệ thống phản biện thông minh.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-foreground mb-4">
              Sản phẩm
            </h4>
            <ul className="space-y-2.5 text-sm">
              {product.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-foreground mb-4">
              Tính năng
            </h4>
            <ul className="space-y-2.5 text-sm">
              {resources.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-bold text-sm uppercase tracking-wider text-foreground mb-4">
              Công ty
            </h4>
            <ul className="space-y-2.5 text-sm">
              {company.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-12 pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} GraduAI. Được tạo với ❤️ bởi đội ngũ sinh viên Việt Nam.
          </div>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Hệ thống đang hoạt động
            </span>
            <span>v1.0 MVP</span>
          </div>
        </div>
      </div>
    </footer>
  );
}