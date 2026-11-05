"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getMe } from "@/lib/api";
import { clearSession, handleSessionExpired } from "@/lib/auth";

export interface AuthUser {
  id?: number | string;
  email: string;
  full_name?: string | null;
  school?: string | null;
  about?: string | null;
  created_at?: string | null;
  roles: string[];
  profile_data?: Record<string, unknown>;
  avatar?: string | null;
  wallpaper?: string | null;
  /** Ngành học (onboarding sau signup) — null nghĩa là chưa chọn. */
  major?: string | null;
}

export interface AuthContextType {
  user: AuthUser | null;
  roles: string[];
  hasRole: (...r: string[]) => boolean;
  isAuthed: boolean;
  loading: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

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
      school: u.school ?? null,
      about: u.about ?? null,
      created_at: u.created_at ?? null,
      roles: u.roles ?? [],
      profile_data: u.profile_data,
      major: u.major ?? null,
      avatar: u.avatar ?? null,
      wallpaper: u.wallpaper ?? null,
    };
  } catch {
    return null;
  }
}

let cachedSnapshot: AuthUser | null = null;
let cacheDirty = true;

function invalidateCache() {
  cacheDirty = true;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", invalidateCache);
}

function getAuthSnapshot(): AuthUser | null {
  if (cacheDirty) {
    cachedSnapshot = readCachedUser();
    cacheDirty = false;
  }
  return cachedSnapshot;
}

const getServerSnapshot = (): AuthUser | null => null;

/** Cờ gói đi theo tài khoản: không có gói active thì phải xoá, nếu không
 *  tài khoản mới trên cùng trình duyệt sẽ thừa hưởng gói của người dùng trước. */
function syncMembershipFlag(profileData: AuthUser["profile_data"]) {
  const membership = profileData?.membership as { status?: string; plan?: string } | undefined;
  if (membership?.status === "active" && membership.plan) {
    localStorage.setItem("membership_plan", membership.plan);
  } else {
    localStorage.removeItem("membership_plan");
  }
}

const emptySubscribe = (notify: () => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const cachedUser = useSyncExternalStore(emptySubscribe, getAuthSnapshot, getServerSnapshot);
  // Tài khoản mà các cờ trong localStorage đang đi theo.
  const flagsOwnerId = useRef<AuthUser["id"]>();

  const fetchUser = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    const cached = readCachedUser();
    if (cached) {
      flagsOwnerId.current = cached.id;
      setUser(cached);
    }

    try {
      const res = await getMe();
      const me = res.data;
      const synced: AuthUser = {
        id: me.id,
        email: me.email,
        full_name: me.full_name,
        school: me.school ?? null,
        about: me.about ?? null,
        created_at: me.created_at ?? null,
        roles: me.roles ?? [],
        profile_data: me.profile_data ?? {},
        major: me.major ?? null,
        avatar: (me as any).avatar ?? cached?.avatar ?? null,
        wallpaper: (me as any).wallpaper ?? cached?.wallpaper ?? null,
      };
      setUser(synced);
      localStorage.setItem("user", JSON.stringify(synced));
      flagsOwnerId.current = synced.id;
      syncMembershipFlag(synced.profile_data);
      invalidateCache();
    } catch (error: any) {
      if (error?.response?.status === 401) {
        setUser(null);
        window.dispatchEvent(new Event("storage"));
        handleSessionExpired();
        return;
      }
      // /me fail (mạng lỗi) → giữ nguyên user từ cache
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    invalidateCache();
    window.dispatchEvent(new Event("storage"));
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    fetchUser();

    const onStorage = () => {
      invalidateCache();
      if (!localStorage.getItem("access_token")) {
        flagsOwnerId.current = undefined;
        setUser(null);
        setLoading(false);
      } else {
        const fresh = readCachedUser();
        if (fresh) {
          // Đăng nhập / đăng ký chuyển trang không reload nên không gọi lại /me:
          // đổi tài khoản thì phải đồng bộ cờ ngay. Cùng tài khoản thì giữ nguyên,
          // vì cache có thể cũ hơn cờ (vd vừa thanh toán xong).
          if (fresh.id !== flagsOwnerId.current) {
            flagsOwnerId.current = fresh.id;
            syncMembershipFlag(fresh.profile_data);
            localStorage.removeItem("mock_ai_trial_tickets");
          }
          setUser(fresh);
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [fetchUser]);

  const currentUser = user ?? cachedUser;
  const roles = useMemo(() => currentUser?.roles ?? [], [currentUser?.roles]);
  const hasRole = useCallback(
    (...r: string[]) => roles.some((x) => r.includes(x)),
    [roles]
  );

  const value = useMemo<AuthContextType>(
    () => ({
      user: currentUser,
      roles,
      hasRole,
      isAuthed: !!currentUser,
      loading,
      logout,
      refreshUser: fetchUser,
    }),
    [currentUser, roles, hasRole, loading, logout, fetchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
