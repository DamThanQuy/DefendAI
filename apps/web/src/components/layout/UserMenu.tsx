"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LogOut, Settings, CreditCard, Award, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { clearSession } from "@/lib/auth";

export function UserMenu() {
  const { user, hasRole } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function handleLogout() {
    clearSession();
    window.dispatchEvent(new Event("storage"));
    window.location.href = "/login";
  }

  const initials = (user?.full_name || user?.email || "U")
    .charAt(0)
    .toUpperCase();

  // Route khác nhau cho student và mentor
  const profileHref = hasRole("mentor") ? "/mentor/profile" : "/profile";
  const historyHref = hasRole("mentor") ? "/mentor/sessions" : "/profile/history";
  const settingsHref = hasRole("mentor") ? "/mentor/profile" : "/profile/settings";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0 shadow-md transition-all ${
          open ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
        }`}
        aria-label="Mở menu tài khoản"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {/* User info */}
          <div className="p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">
                    {user?.full_name || user?.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {user?.email}
                  </p>
                </div>
              </div>
            </div>

          {/* Menu items */}
          <div className="p-2">
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <User className="w-4 h-4 text-primary" />
              Hồ sơ cá nhân
            </Link>
            <Link
              href={historyHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <History className="w-4 h-4 text-secondary" />
              Lịch sử hoạt động
            </Link>
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <CreditCard className="w-4 h-4 text-accent" />
              Gói thành viên
            </Link>
            <Link
              href={settingsHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              Cài đặt
            </Link>
          </div>

          <div className="border-t border-border p-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}