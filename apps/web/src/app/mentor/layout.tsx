"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  CalendarDays, 
  CalendarClock, 
  Video, 
  User, 
  Star, 
  Wallet
} from "lucide-react";

const mentorNavigation = [
  { name: "Tổng quan", href: "/mentor/dashboard", icon: LayoutDashboard, section: "Dashboard & Calendar" },
  { name: "Lịch rảnh", href: "/mentor/calendar", icon: CalendarDays, section: "Dashboard & Calendar" },
  { name: "Yêu cầu đặt lịch", href: "/mentor/bookings", icon: CalendarClock, section: "Session Management" },
  { name: "Lịch sử Mentor", href: "/mentor/sessions", icon: Video, section: "Session Management" },
  { name: "Hồ sơ cá nhân", href: "/mentor/profile", icon: User, section: "Expertise & Feedback" },
  { name: "Đánh giá học viên", href: "/mentor/reviews", icon: Star, section: "Expertise & Feedback" },
  { name: "Ví & Thu nhập", href: "/mentor/wallet", icon: Wallet, section: "Earnings" },
];

export default function MentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-r border-border shrink-0 flex flex-col">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-serif font-bold text-primary tracking-tight">Mentor Portal</h2>
          <p className="text-[12px] text-muted-foreground mt-1">Quản lý chuyên gia</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
          {mentorNavigation.map((item, index) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            // Add section headers
            const isFirstInSection = index === 0 || mentorNavigation[index - 1].section !== item.section;
            
            return (
              <React.Fragment key={item.name}>
                {isFirstInSection && (
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-4 mb-2 px-3">
                    {item.section}
                  </div>
                )}
                <Link 
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                    isActive 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  {item.name}
                </Link>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Bottom User Info */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-[14px]">
              DR
            </div>
            <div>
              <div className="text-[13px] font-bold text-foreground">Tiến sĩ A</div>
              <div className="text-[11px] text-muted-foreground">Mentor Cao Cấp</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
