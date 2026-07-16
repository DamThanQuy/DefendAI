import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-background border-t border-zinc-800/60 py-8">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between px-4 lg:px-8 gap-6">
        <div className="flex-shrink-0">
          <Link href="/" className="text-2xl font-extrabold tracking-tighter">
            <span className="text-gradient">GraduAI</span>
          </Link>
        </div>

        <nav className="flex flex-wrap justify-center gap-8 text-sm text-zinc-500 font-medium">
          <Link href="#" className="hover:text-zinc-300 transition-colors">Về chúng tôi</Link>
          <Link href="#" className="hover:text-zinc-300 transition-colors">Điều khoản</Link>
          <Link href="#" className="hover:text-zinc-300 transition-colors">Chính sách bảo mật</Link>
          <Link href="#" className="hover:text-zinc-300 transition-colors">Liên hệ</Link>
        </nav>

        <div className="text-sm text-zinc-600 md:text-right">
          © {new Date().getFullYear()} GraduAI. Nền tảng hỗ trợ học thuật thông minh.
        </div>
      </div>
    </footer>
  );
}
