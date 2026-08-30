"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Chuyển hướng từ trang quản trị cũ (/admin) sang màn hình mặc định.
export default function AdminIndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/overview");
  }, [router]);
  return null;
}
