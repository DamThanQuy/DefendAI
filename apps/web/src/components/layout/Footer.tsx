import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#f1f3f5] py-8 border-t border-gray-200">
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between px-4 lg:px-8 gap-6">
        <div className="flex-shrink-0">
          <Link href="/" className="text-2xl font-extrabold text-[#0f2e82] tracking-tight">
            GraduAI
          </Link>
        </div>
        
        <nav className="flex flex-wrap justify-center gap-8 text-[13px] text-gray-500 font-medium">
          <Link href="#" className="hover:text-[#0f2e82] transition-colors">Về chúng tôi</Link>
          <Link href="#" className="hover:text-[#0f2e82] transition-colors">Điều khoản</Link>
          <Link href="#" className="hover:text-[#0f2e82] transition-colors">Chính sách bảo mật</Link>
          <Link href="#" className="hover:text-[#0f2e82] transition-colors">Liên hệ</Link>
        </nav>
        
        <div className="text-[13px] text-gray-500 md:text-right">
          © 2024 GraduAI. Nền tảng hỗ trợ học thuật thông minh.
        </div>
      </div>
    </footer>
  );
}
