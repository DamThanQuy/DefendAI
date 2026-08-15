"use client";

import React from "react";

/**
 * Mentor layout — KHÔNG render sidebar riêng nữa.
 * Menu mentor đã được gộp vào AppShell (sidebar chung) qua SIDEBAR_LINKS
 * có roles:["mentor"], tránh tình trạng 2 sidebar chồng nhau.
 * Layout này chỉ là wrapper content; AppShell bọc bên ngoài xử lý sidebar + topbar.
 */
export default function MentorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
