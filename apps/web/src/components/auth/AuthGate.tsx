"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { refreshAccessToken, clearSession, getTokenExpiry } from "@/lib/auth";

// Trang cần đăng nhập mới truy cập được.
const PROTECTED_PATHS = [
"/questions",
"/room",
"/report",
"/analyze",
"/documents",
"/bookings",
"/mock-room",
"/mentor/bookings",
];

// Route → role được phép. Thiếu role → redirect "/".
// ponytail: client guard chỉ là UX; BE (deps.require_roles) mới là bảo mật thực sự.
const ROLE_ROUTES: Record<string, string[]> = {
  "/admin": ["admin"],
  "/admin/overview": ["admin"],
  "/admin/mentor-verification": ["admin"],
  "/admin/dispute": ["admin"],
  "/admin/payout": ["admin"],
  "/admin/users": ["admin"],
  "/admin/settings": ["admin"],
  "/admin/moderation": ["admin"],
  "/admin/ai-monitor": ["admin"],
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Refresh mọi session đang tồn tại, kể cả các route không nằm trong danh sách
  // protected cũ như admin/subscriptions. Refresh trước 5 phút để tránh rớt
  // phiên giữa lúc người dùng đang thao tác.
  useEffect(() => {
    const check = async () => {
      const accessToken = localStorage.getItem("access_token");
      if (!accessToken) {
        if (isProtected) router.replace("/login");
        return;
      }
      const exp = getTokenExpiry();
      // Token cũ không có exp thì để API interceptor xử lý khi request thực tế.
      if (exp === null) return;
      const now = Date.now();
      if (now >= exp - 5 * 60 * 1000) {
        const ok = await refreshAccessToken();
        if (!ok) {
          clearSession();
          router.replace("/login");
        }
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [isProtected, router]);

  useEffect(() => {
    if (isProtected && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }

    // Guard theo role
    for (const [path, allowed] of Object.entries(ROLE_ROUTES)) {
      if (pathname === path || pathname.startsWith(`${path}/`)) {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        const roles: string[] = stored.roles ?? [];
        if (!roles.some((r) => allowed.includes(r))) {
          router.replace("/");
          return;
        }
      }
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
