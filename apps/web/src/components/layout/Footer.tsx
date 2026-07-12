import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-surface border-t border-border py-8">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between px-4 lg:px-8 gap-6">
        <div className="flex-shrink-0">
          <Link href="/" className="text-2xl font-extrabold text-teal-400 tracking-tight">
            Gradu<span className="text-foreground">AI</span>
          </Link>
        </div>

        <nav className="flex flex-wrap justify-center gap-8 text-[13px] text-muted-foreground font-medium">
          <Link href="#" className="hover:text-teal-400 transition-colors duration-200">Về chúng tôi</Link>
          <Link href="#" className="hover:text-teal-400 transition-colors duration-200">Điều khoản</Link>
          <Link href="#" className="hover:text-teal-400 transition-colors duration-200">Chính sách bảo mật</Link>
          <Link href="#" className="hover:text-teal-400 transition-colors duration-200">Liên hệ</Link>
        </nav>

        <div className="text-[13px] text-muted-foreground md:text-right font-mono">
          © 2024 GraduAI. Nền tảng hỗ trợ học thuật thông minh.
        </div>
      </div>
    </footer>
  );
}
