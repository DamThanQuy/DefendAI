import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-background/80 backdrop-blur-lg border-t border-border/40 py-8 relative overflow-hidden">
      {/* Decorative gradient orb */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-full bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between px-4 lg:px-8 gap-6 relative z-10">
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
