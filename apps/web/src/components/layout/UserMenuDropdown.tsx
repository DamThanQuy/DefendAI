"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  User,
  Settings,
  CreditCard,
  History,
  Award,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Camera,
  ExternalLink,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { clearSession } from "@/lib/auth";

export function UserMenuDropdown() {
  const { user } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  function handleLogout() {
    clearSession();
    window.dispatchEvent(new Event("storage"));
    setIsOpen(false);
    router.push("/login");
  }

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex items-center p-0.5 rounded-full transition-all cursor-pointer focus:outline-none"
        aria-label="Menu tài khoản"
        title={user.full_name || "Tài khoản của bạn"}
      >
        <div
          className={`w-9 h-9 rounded-full overflow-hidden transition-all duration-200 ring-2 ${
            isOpen
              ? "ring-primary scale-105 shadow-md shadow-primary/25"
              : "ring-border group-hover:ring-primary/60"
          }`}
        >
          <Image
            src={user.avatar || "/avatar.jpg"}
            alt={user.full_name || "Avatar"}
            width={36}
            height={36}
            className="w-full h-full object-cover"
          />
        </div>
        {/* Active online dot */}
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
      </button>

      {/* Popover Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-12 z-50 w-76 rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl p-2.5 space-y-2"
          >
            {/* Header: User Profile Card */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/40">
              <div className="relative w-11 h-11 rounded-full overflow-hidden ring-2 ring-primary/30 shrink-0">
                <Image
                  src={user.avatar || "/avatar.jpg"}
                  alt={user.full_name || "Avatar"}
                  width={44}
                  height={44}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground truncate">
                  {user.full_name || "Người dùng GraduAI"}
                </p>
                <p className="text-xs text-muted-foreground truncate font-mono">
                  {user.email}
                </p>
                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  <ShieldCheck className="w-3 h-3" />
                  {user.roles?.includes("admin")
                    ? "Quản trị viên"
                    : user.roles?.includes("mentor")
                    ? "Mentor"
                    : "Sinh viên"}
                </div>
              </div>
            </div>

            {/* Menu Sections */}
            <div className="space-y-0.5">
              <Link
                href="/profile"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                  <span>Hồ sơ cá nhân</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/profile/avatar"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
                    <Camera className="w-4 h-4" />
                  </div>
                  <span>Đổi ảnh đại diện</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/profile/settings"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span>Cài đặt tài khoản</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/profile/billing"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <span>Gói dịch vụ & Thanh toán</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/profile/history"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <History className="w-4 h-4" />
                  </div>
                  <span>Lịch sử luyện tập</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/profile/achievements"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                  <span>Thành tựu & Huy hiệu</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Logout Action */}
            <div className="pt-1 border-t border-border/60">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="font-semibold">Đăng xuất</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
