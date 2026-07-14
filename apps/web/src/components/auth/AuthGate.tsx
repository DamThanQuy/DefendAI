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
