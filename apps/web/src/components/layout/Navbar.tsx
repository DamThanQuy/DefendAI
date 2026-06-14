import Link from "next/link";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/", label: "Trang chủ" },
  { href: "/questions", label: "AI Results" },
  { href: "/code-review", label: "Code Review" },
  { href: "/room", label: "Mock Room" },
  { href: "/report", label: "Report" },
];

export function Navbar() {
  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold text-primary">
          GraduAI
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-primary transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/login">
            <Button variant="outline" size="sm">Đăng nhập</Button>
          </Link>
          <Link href="/register">
            <Button size="sm">Đăng ký</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
