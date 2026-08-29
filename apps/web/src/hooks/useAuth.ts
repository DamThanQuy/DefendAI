"use client";

import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";

export interface AuthUser {
  id?: number;
  email: string;
  full_name?: string | null;
  roles: string[];
}

// Hiển thị sidebar TỨC THÌ từ localStorage cache (tránh flash trống menu sau
// khi login), đồng thời gọi /api/auth/me (nguồn chân lý) để đồng bộ roles.
// Nếu backend đổi role (vd student → mentor) mà cache cũ giữ roles sai, /me
// sẽ trả roles đúng và ta cập nhật lại (chỉ re-render 1 lần, không flash sai menu).
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const token = localStorage.getItem("access_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    // 1) Set user từ cache NGAY để sidebar hiện tức thì (không trống sau login)
    const raw = localStorage.getItem("user");
    if (raw) {
      try {
        const u = JSON.parse(raw) as Partial<AuthUser>;
        setUser({
          id: u.id,
          email: u.email ?? "",
          full_name: u.full_name ?? null,
          roles: u.roles ?? [],
        });
      } catch {
        /* ignore */
      }
    }

    // 2) Gọi /me để đồng bộ roles chính xác từ server
    getMe()
      .then((res) => {
        if (cancelled) return;
        const me = res.data;
        const synced: AuthUser = {
          id: me.id,
          email: me.email,
          full_name: me.full_name,
          roles: me.roles ?? [],
        };
        setUser(synced);
        // Ghi đè cache cũ để các lần sau đọc đúng
        localStorage.setItem("user", JSON.stringify(synced));
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // /me fail (mạng lỗi) → giữ nguyên user từ cache (đã set ở bước 1)
        setLoading(false);
      });

    // Đồng bộ khi user đăng nhập/đăng xuất ở tab khác
    const onStorage = () => {
      if (!localStorage.getItem("access_token")) {
        setUser(null);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const roles = user?.roles ?? [];
  const hasRole = (...r: string[]) => roles.some((x) => r.includes(x));
  return { user, roles, hasRole, isAuthed: !!user, loading };
}
