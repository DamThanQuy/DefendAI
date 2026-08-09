"use client";

import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";

export interface AuthUser {
  email: string;
  full_name?: string | null;
  roles: string[];
}

// Đọc user + roles từ localStorage làm cache nhanh, SAU ĐÓ luôn đồng bộ từ
// /api/auth/me (nguồn chân lý). Điều này fix lỗi: backend đổi role (vd student
// → mentor) mà frontend vẫn dùng roles cũ trong localStorage → sai giao diện.
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);

  // Đọc cache localStorage ngay (để guard UI không bị chớp)
  useEffect(() => {
    const read = () => {
      const raw = localStorage.getItem("user");
      if (!localStorage.getItem("access_token") || !raw) {
        setUser(null);
        return;
      }
      try {
        const u = JSON.parse(raw) as Partial<AuthUser>;
        setUser({
          email: u.email ?? "",
          full_name: u.full_name ?? null,
          roles: u.roles ?? [],
        });
      } catch {
        setUser(null);
      }
    };
    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  // Đồng bộ roles từ server (chạy sau khi mount để không block render)
  useEffect(() => {
    if (!localStorage.getItem("access_token")) return;
    let cancelled = false;
    getMe()
      .then((res) => {
        if (cancelled) return;
        const me = res.data;
        const synced: AuthUser = {
          email: me.email,
          full_name: me.full_name,
          roles: me.roles ?? [],
        };
        setUser(synced);
        // Ghi đè cache cũ để các tab/lần sau đọc đúng
        localStorage.setItem("user", JSON.stringify(synced));
      })
      .catch(() => {
        /* giữ nguyên cache cũ nếu lỗi mạng */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const roles = user?.roles ?? [];
  const hasRole = (...r: string[]) => roles.some((x) => r.includes(x));
  return { user, roles, hasRole, isAuthed: !!user };
}
