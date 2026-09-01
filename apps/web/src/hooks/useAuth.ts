"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getMe } from "@/lib/api";

export interface AuthUser {
  id?: number | string;
  email: string;
  full_name?: string | null;
  roles: string[];
}

// Hiển thị sidebar TỨC THÌ từ localStorage cache (tránh flash trống menu sau
// khi login), đồng thời gọi /api/auth/me (nguồn chân lý) để đồng bộ roles.
// Nếu backend đổi role (vd student → mentor) mà cache cũ giữ roles sai, /me
// sẽ trả roles đúng và ta cập nhật lại (chỉ re-render 1 lần, không flash sai menu).
//
// ⚠️ HYDRATION (bug đã gặp): KHÔNG ĐƯỢC đọc localStorage trong useState lazy
// initializer. Server render không có localStorage → HTML chứa nhánh "chưa
// login" (<a> Đăng nhập), client render đầu lại có user từ cache → nhánh khác
// (<span> tên user) → "Expected server HTML to contain a matching <span> in
// <div>" → hydration fail toàn root. Fix: user khởi tạo null (khớp SSR), đọc
// cache qua useSyncExternalStore — getSnapshot chạy CHỈ ở client sau hydration,
// nên không mismatch mà vẫn hiện tức thì (không flash logged-out).
function readCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as Partial<AuthUser>;
    return {
      id: u.id,
      email: u.email ?? "",
      full_name: u.full_name ?? null,
      roles: u.roles ?? [],
    };
  } catch {
    return null;
  }
}

// useSyncExternalStore cần getSnapshot trả về giá trị ổn định (===) giữa các
// lần gọi — object mới mỗi lần sẽ gây vòng lặp re-render vô hạn. Cache kết quả
// parse và chỉ invalidate khi storage event / logout dispatch event "storage".
let cachedSnapshot: AuthUser | null = null;
let cacheDirty = true;

function invalidateCache() {
  cacheDirty = true;
}

if (typeof window !== "undefined") {
  // Tab khác login/logout, hoặc chính tab này dispatch Event("storage") khi logout
  window.addEventListener("storage", invalidateCache);
}

function getAuthSnapshot(): AuthUser | null {
  if (cacheDirty) {
    cachedSnapshot = readCachedUser();
    cacheDirty = false;
  }
  return cachedSnapshot;
}

// Server luôn render "chưa login" — khớp HTML SSR, client sẽ cập nhật sau hydrate.
const getServerSnapshot = (): AuthUser | null => null;

// Store rỗng: chỉ cần 1 subscribe để React re-check snapshot khi storage đổi.
const emptySubscribe = (notify: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Cached user từ localStorage — null trên server (khớp SSR), đọc client-side
  // sau hydrate. Không gây hydration mismatch, không flash UI logged-out.
  const cachedUser = useSyncExternalStore(emptySubscribe, getAuthSnapshot, getServerSnapshot);

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
    const cached = readCachedUser();
    if (cached) {
      setUser(cached);
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
        invalidateCache();
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

  const roles = user?.roles ?? cachedUser?.roles ?? [];
  const hasRole = (...r: string[]) => roles.some((x) => r.includes(x));
  return { user: user ?? cachedUser, roles, hasRole, isAuthed: !!(user ?? cachedUser), loading };
}
