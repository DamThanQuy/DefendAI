"use client";

import { useAuth } from "@/hooks/useAuth";

// Trang quản trị — chỉ admin (AuthGate đã guard route /admin).
export default function AdminPage() {
  const { user, roles } = useAuth();

  return (
    <main className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">Quản trị hệ thống</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Chào {user?.full_name || user?.email}, vai trò: {roles.join(", ")}
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-background/50 p-5">
          <h2 className="font-semibold">Người dùng</h2>
          <p className="mt-1 text-sm text-muted-foreground">Quản lý tài khoản, phân quyền.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-background/50 p-5">
          <h2 className="font-semibold">Đánh giá</h2>
          <p className="mt-1 text-sm text-muted-foreground">Xem / duyệt kết quả AI.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-background/50 p-5">
          <h2 className="font-semibold">Cài đặt</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cấu hình hệ thống.</p>
        </div>
      </div>
    </main>
  );
}
