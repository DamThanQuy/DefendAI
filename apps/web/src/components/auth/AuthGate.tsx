"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { refreshAccessToken, clearSession, getTokenExpiry } from "@/lib/auth";

// Trang cần đăng nhập mới truy cập được.
const PROTECTED_PATHS = [
  "/questions",
  "/code-review",
  "/room",
  "/report",
  "/analyze",
  "/documents",
];

// Route → role được phép. Thiếu role → redirect "/".
// ponytail: client guard chỉ là UX; BE (deps.require_roles) mới là bảo mật thực sự.
const ROLE_ROUTES: Record<string, string[]> = {
  "/admin": ["admin"],
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Session check: nếu token đã hết hạn → refresh; refresh thất bại → về /login.
  // Chạy lại mỗi 60s để bắt session sắp hết hạn mà không cần chờ request 401.
  useEffect(() => {
    const check = async () => {
      if (!isProtected) return;
      if (!localStorage.getItem("access_token")) {
        router.replace("/login");
        return;
      }
      const exp = getTokenExpiry();
      // Không đọc được exp (token cũ không có) → giữ nguyên hành vi cũ (chỉ check tồn tại)
      if (exp === null) return;
      const now = Date.now();
      // Refresh sớm 5 phút trước khi hết hạn, hoặc nếu đã hết hạn
      if (now >= exp - 5 * 60 * 1000) {
        // Dùng chung single-flight queue với api.ts — tránh race rotate token
        const ok = await refreshAccessToken();
        if (!ok) {
          clearSession();
          router.replace("/login");
        }
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
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
