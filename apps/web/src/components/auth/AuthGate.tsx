"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Trang cần đăng nhập mới truy cập được.
const PROTECTED_PATHS = [
  "/upload",
  "/questions",
  "/code-review",
  "/room",
  "/report",
  "/analyze",
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

  useEffect(() => {
    const isProtected = PROTECTED_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

    if (isProtected && !localStorage.getItem("token")) {
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
