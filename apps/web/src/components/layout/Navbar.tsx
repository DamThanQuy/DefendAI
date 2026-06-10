import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-primary">GraduAI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-primary transition-colors">Trang chủ</Link>
          <Link href="/questions" className="hover:text-primary transition-colors">AI Results</Link>
          <Link href="/code-review" className="hover:text-primary transition-colors">Code Review</Link>
          <Link href="/room" className="hover:text-primary transition-colors">Mock Room</Link>
          <Link href="/report" className="hover:text-primary transition-colors">Report</Link>
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
