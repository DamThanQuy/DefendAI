"use client";

import { useEffect, useState } from "react";

/**
 * Sidebar thu gọn được, trạng thái lưu theo từng user (email unique) trong
 * localStorage — sống sót qua reload và logout/login.
 *
 * Dùng chung cho mọi sidebar (Files, Chat, ...) để không lặp pattern.
 */
export function useCollapsedSidebar(keyPrefix: string) {
  const [open, setOpen] = useState(true);

  // Key theo email user — mỗi user có cài đặt riêng.
  const storageKey = () => {
    let email = "";
    try {
      email = (JSON.parse(localStorage.getItem("user") || "{}") as { email?: string }).email ?? "";
    } catch { /* ignore */ }
    return `${keyPrefix}_collapsed_${email}`;
  };

  // Khôi phục trạng thái từ localStorage khi mount.
  useEffect(() => {
    setOpen(localStorage.getItem(storageKey()) !== "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      localStorage.setItem(storageKey(), prev ? "1" : "0");
      return !prev;
    });
  };

  return { open, toggle };
}