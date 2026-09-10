"use client";

import { useCallback, useEffect, useState } from "react";

// Hook dùng chung cho các trang quản trị (admin). Tách từ trang /admin cũ
// để các chức năng admin nằm rải rác ở sidebar thay vì gộp 1 trang.

export function authHeaders() {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Cấu hình AI Provider (System Settings)
// ---------------------------------------------------------------------------
export const FIELD_META: { key: string; label: string; hint: string; type?: string }[] = [
  { key: "default_provider", label: "Provider mặc định", hint: "Provider cho AI gateway (localhost | nvidia)" },
  { key: "localhost_api_key", label: "Local API key", hint: "sk-...", type: "password" },
  { key: "localhost_base_url", label: "Local URL", hint: "http://localhost:20128/v1" },
  { key: "localhost_model", label: "Local model", hint: "google" },
];

export interface SettingsMap {
  [key: string]: string;
}

export function useAdminSettings() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { headers: authHeaders() });
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      else setMsg({ type: "err", text: data.error || "Không tải được cấu hình" });
    } catch {
      setMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setLoading(false);
    }
  }, []);

  const set = (key: string, value: string) => setSettings((s) => ({ ...s, [key]: value }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (res.ok && data.applied) {
        setMsg({ type: "ok", text: "Đã lưu và áp dụng cấu hình." });
      } else {
        setMsg({ type: "err", text: data.error || data.detail || "Lưu thất bại" });
      }
    } catch {
      setMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  return { settings, setSettings, loading, saving, msg, setMsg, set, save };
}

// ---------------------------------------------------------------------------
// Tài liệu chuẩn (reference_chunks)
// ---------------------------------------------------------------------------
export const REF_CATEGORIES: { key: string; label: string }[] = [
  { key: "textbook", label: "Giáo trình / chuẩn" },
  { key: "rubric", label: "Rubric" },
  { key: "sample_project", label: "Dự án mẫu" },
  { key: "spec", label: "Đặc tả" },
];

export interface RefItem {
  category: string;
  title: string;
  chunks: number;
  updated_at: string;
}

export function useAdminReference() {
  const [refItems, setRefItems] = useState<RefItem[]>([]);
  const [refLoading, setRefLoading] = useState(true);
  const [refMsg, setRefMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refCategory, setRefCategory] = useState("rubric");
  const [refTitle, setRefTitle] = useState("");
  const [refSource, setRefSource] = useState("");
  const [refRunning, setRefRunning] = useState(false);
  const [refPreview, setRefPreview] = useState<Record<string, string[]>>({});
  const [refDeleting, setRefDeleting] = useState<string | null>(null);

  const loadReference = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reference/", { headers: authHeaders() });
      const data = await res.json();
      if (data.items) setRefItems(data.items);
      else setRefMsg({ type: "err", text: data.error || "Không tải được tài liệu chuẩn" });
    } catch {
      setRefMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setRefLoading(false);
    }
  }, []);

  const refKey = (category: string, title: string) => `${category}|${title}`;

  const uploadReference = async () => {
    if (!refFile || !refTitle.trim() || refRunning) return;
    setRefRunning(true);
    setRefMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", refFile);
      fd.append("category", refCategory);
      fd.append("title", refTitle.trim());
      fd.append("source", refSource.trim());
      const res = await fetch("/api/admin/reference/", {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setRefMsg({ type: "err", text: data.detail || data.error || "Upload thất bại" });
        return;
      }
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((r) => setTimeout(r, 1500));
        const jr = await fetch(`/api/jobs/${data.job_id}`, { headers: authHeaders() });
        if (!jr.ok) continue;
        const job = await jr.json();
        if (job.status === "completed" || job.status === "failed") break;
      }
      setRefMsg({ type: "ok", text: "Đã index tài liệu chuẩn." });
      setRefFile(null);
      setRefTitle("");
      setRefSource("");
      await loadReference();
    } catch {
      setRefMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setRefRunning(false);
    }
  };

  const togglePreview = async (category: string, title: string) => {
    const key = refKey(category, title);
    if (refPreview[key]) {
      setRefPreview((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
      return;
    }
    try {
      const res = await fetch(`/api/admin/reference/?category=${encodeURIComponent(category)}&title=${encodeURIComponent(title)}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setRefPreview((p) => ({ ...p, [key]: (data.items ?? []).map((c: { content: string }) => c.content) }));
    } catch {
      setRefMsg({ type: "err", text: "Không tải được nội dung tài liệu chuẩn" });
    }
  };

  const removeRef = async (category: string, title: string) => {
    if (!confirm(`Xoá tài liệu chuẩn "${title}"? (chunks + file gốc)`)) return;
    const key = refKey(category, title);
    setRefDeleting(key);
    setRefMsg(null);
    try {
      const res = await fetch(`/api/admin/reference/?category=${encodeURIComponent(category)}&title=${encodeURIComponent(title)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setRefMsg({ type: "err", text: data.detail || data.error || "Xoá thất bại" });
      } else {
        setRefMsg({ type: "ok", text: `Đã xoá "${title}" (${data.deleted_chunks} chunks).` });
        await loadReference();
      }
    } catch {
      setRefMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setRefDeleting(null);
    }
  };

  useEffect(() => {
    loadReference();
  }, [loadReference]);

  return {
    refItems, refLoading, refMsg, setRefMsg, refFile, setRefFile, refCategory, setRefCategory,
    refTitle, setRefTitle, refSource, setRefSource, refRunning, refPreview, refDeleting,
    loadReference, refKey, uploadReference, togglePreview, removeRef,
  };
}

// ---------------------------------------------------------------------------
// Quản lý người dùng + Mentor Verification
// ---------------------------------------------------------------------------
export interface UserRow {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  roles: string[];
  created_at: string | null;
}

export function useAdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userMsg, setUserMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [userSaving, setUserSaving] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { headers: authHeaders() });
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
        setRoleOptions(data.role_options ?? []);
      } else setUserMsg({ type: "err", text: data.error || "Không tải được người dùng" });
    } catch {
      setUserMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const updateUser = async (id: number, patch: { is_active?: boolean; roles?: string[] }) => {
    setUserSaving(id);
    setUserMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) setUserMsg({ type: "err", text: data.detail || data.error || "Cập nhật thất bại" });
      else {
        setUserMsg({ type: "ok", text: `Đã cập nhật ${data.user.email}` });
        await loadUsers();
      }
    } catch {
      setUserMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setUserSaving(null);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return { users, roleOptions, usersLoading, userMsg, setUserMsg, userSaving, loadUsers, updateUser };
}

// ---------------------------------------------------------------------------
// Overview Dashboard
// ---------------------------------------------------------------------------
export interface OverviewData {
  total_users: number;
  new_users: number;
  total_mentors: number;
  total_bookings: number;
  completed_bookings: number;
  pending_bookings: number;
  total_reviews: number;
  completed_reviews: number;
  total_revenue: number;
}

export function useAdminOverview() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/overview", { headers: authHeaders() });
        const data = await res.json();
        if (data.total_users !== undefined) setOverview(data);
      } catch {
        /* noop */
      } finally {
        setOverviewLoading(false);
      }
    })();
  }, []);

  return { overview, overviewLoading };
}

// ---------------------------------------------------------------------------
// Dispute Center (bookings oversight)
// ---------------------------------------------------------------------------
export interface BookingRow {
  id: number;
  title: string;
  note: string | null;
  status: string;
  proposed_time: string | null;
  confirmed_time: string | null;
  reject_reason: string | null;
  student_name: string | null;
  student_email: string | null;
  mentor_name: string | null;
  mentor_email: string | null;
  created_at: string | null;
}

export function useAdminBookings() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/bookings", { headers: authHeaders() });
        const data = await res.json();
        if (data.items) setBookings(data.items);
      } catch {
        /* noop */
      } finally {
        setBookingsLoading(false);
      }
    })();
  }, []);

  return { bookings, bookingsLoading };
}

// ---------------------------------------------------------------------------
// Giám sát code review (oversight)
// ---------------------------------------------------------------------------
export interface ReviewRow {
  analysis_id: number;
  document_name: string;
  user_email: string;
  status: string;
  total_files: number | null;
  stats: Record<string, number> | null;
  created_at: string | null;
}

export function useAdminReviews() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewDetail, setReviewDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/code-reviews", { headers: authHeaders() });
        const data = await res.json();
        if (data.items) setReviews(data.items);
      } catch {
        /* noop */
      } finally {
        setReviewsLoading(false);
      }
    })();
  }, []);

  const openReview = async (id: number) => {
    setDetailLoading(true);
    setReviewDetail(null);
    try {
      const res = await fetch(`/api/code/analyses/${id}`, { headers: authHeaders() });
      const data = await res.json();
      setReviewDetail(res.ok ? data : { error: data.detail || "Không tải được" });
    } catch {
      setReviewDetail({ error: "Không kết nối được máy chủ" });
    } finally {
      setDetailLoading(false);
    }
  };

  return { reviews, reviewsLoading, reviewDetail, setReviewDetail, detailLoading, openReview };
}

export function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-400",
    confirmed: "bg-teal-500/10 text-teal-400",
    rejected: "bg-red-500/10 text-red-400",
    completed: "bg-zinc-700/40 text-zinc-300",
    cancelled: "bg-zinc-700/40 text-zinc-300",
  };
  return `px-2 py-0.5 text-[11px] font-bold rounded-full ${map[status] ?? "bg-zinc-700/40 text-zinc-300"}`;
}
