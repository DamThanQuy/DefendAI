"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { parseApiDate } from "@/lib/datetime";

export type PlanAccess = {
  plan: "free" | "premium" | "vip";
  /** Tên gói đã hết hạn; null nếu chưa từng mua hoặc gói còn hạn. */
  expired_plan: string | null;
  features: { mock_ai: boolean; code_review: boolean; rubric: boolean; mentor_booking: boolean };
  free_mentor_bookings_left: number;
};

/** Quyền theo gói do server tính. Chưa có kết quả thì `access` là null: không khoá giao diện, API vẫn chặn. */
export function usePlanAccess() {
  const { user } = useAuth();
  const userId = user?.id;
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setAccess(null);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/payment/account", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = response.ok ? await response.json() : null;
      setAccess(data?.access ?? null);
    } catch {
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, userId]);

  return { access, loading, refresh };
}

/** Khi chưa lấy được quyền từ server: dựa vào membership trong hồ sơ để không khoá nhầm người đang là VIP. */
export function hasVipInProfile(profileData: unknown): boolean {
  const membership = (profileData as { membership?: { status?: string; plan?: string; expires_at?: string } } | null | undefined)
    ?.membership;
  if (membership?.status !== "active" || !["vip", "pro"].includes(String(membership.plan).toLowerCase())) return false;
  return !membership.expires_at || parseApiDate(membership.expires_at) > new Date();
}
