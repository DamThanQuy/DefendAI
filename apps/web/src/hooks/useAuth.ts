"use client";

import { useEffect, useState } from "react";

export interface AuthUser {
  email: string;
  full_name?: string | null;
  roles: string[];
}

// Đọc user + roles từ localStorage (BE đã trả sẵn user.roles: string[] sau login).
// ponytail: không decode JWT, không gọi /me mỗi render — localStorage là cache đủ cho UX guard.
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const read = () => {
      const raw = localStorage.getItem("user");
      if (!localStorage.getItem("token") || !raw) {
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

  const roles = user?.roles ?? [];
  const hasRole = (...r: string[]) => roles.some((x) => r.includes(x));
  return { user, roles, hasRole, isAuthed: !!user };
}
