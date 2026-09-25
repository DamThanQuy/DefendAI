"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  UserCog,
  Save,
  ArrowLeft,
  GraduationCap,
  Mail,
  Loader2,
  IdCard,
  Text,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { updateMe } from "@/lib/api";

export default function EditProfilePage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Điền form từ user (cache → rồi /me cập nhật). Chỉ ghi đè những field
  // mà người dùng CHƯA tự sửa, để không mất nội dung đang gõ dở.
  const touched = React.useRef({ full_name: false, school: false, about: false });
  useEffect(() => {
    if (!user) return;
    setFullName((v) => (touched.current.full_name ? v : user.full_name ?? ""));
    setSchool((v) => (touched.current.school ? v : user.school ?? ""));
    setAbout((v) => (touched.current.about ? v : user.about ?? ""));
  }, [user]);

  const dirty =
    fullName !== (user?.full_name ?? "") ||
    school !== (user?.school ?? "") ||
    about !== (user?.about ?? "");

  async function handleSave() {
    if (!fullName.trim()) {
      setMsg({ type: "err", text: "Họ và tên không được để trống." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await updateMe({
        full_name: fullName.trim(),
        school: school.trim(),
        about: about.trim(),
      });
      // Cập nhật cache localStorage để useAuth / sidebar hiển thị ngay
      const cached = {
        id: res.data.id,
        email: res.data.email,
        full_name: res.data.full_name,
        school: res.data.school,
        about: res.data.about,
        created_at: res.data.created_at,
        roles: res.data.roles,
      };
      localStorage.setItem("user", JSON.stringify(cached));
      // Báo các tab/component khác (useSyncExternalStore) đọc lại cache
      window.dispatchEvent(new Event("storage"));
      setMsg({ type: "ok", text: "Đã lưu hồ sơ cá nhân." });
      setTimeout(() => setMsg(null), 3000);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail || err?.message || "Không thể lưu. Vui lòng thử lại.";
      setMsg({ type: "err", text: typeof detail === "string" ? detail : "Lỗi không xác định." });
    } finally {
      setSaving(false);
    }
  }

  const initials = (fullName || user?.email || "U").charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-primary">
        <UserCog className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">
          Sửa hồ sơ cá nhân
        </span>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
            Hồ sơ cá nhân
          </h1>
          <p className="text-muted-foreground">
            Cập nhật tên hiển thị, trường học và giới thiệu về bạn.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-bold shadow-[0_0_15px_hsl(var(--primary)/0.4)] hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </div>

      {msg && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium border ${
            msg.type === "ok"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              : "bg-red-500/10 text-red-400 border-red-500/30"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Avatar + email (không đổi được) */}
      <div className="dark-card rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground text-2xl font-black shadow-md">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-lg truncate">{fullName || "Sinh viên"}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              {user?.email ?? "—"}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              Email là định danh đăng nhập và không thể thay đổi.
            </p>
          </div>
        </div>
      </div>

      {/* Form thông tin */}
      <div className="dark-card rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
            <IdCard className="w-3.5 h-3.5" />
            Họ và tên
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => {
              touched.current.full_name = true;
              setFullName(e.target.value);
            }}
            maxLength={255}
            placeholder="Nguyễn Văn A"
            className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" />
            Trường đang theo học
          </label>
          <input
            type="text"
            value={school}
            onChange={(e) => {
              touched.current.school = true;
              setSchool(e.target.value);
            }}
            maxLength={255}
            placeholder="VD: Đại học FPT, UEH, HCMUT..."
            className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
            <Text className="w-3.5 h-3.5" />
            Giới thiệu ngắn
          </label>
          <textarea
            value={about}
            onChange={(e) => {
              touched.current.about = true;
              setAbout(e.target.value);
            }}
            maxLength={500}
            rows={4}
            placeholder="Vài dòng về bạn: ngành học, đồ án đang làm, mục tiêu bảo vệ..."
            className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
          />
          <p className="text-[11px] text-muted-foreground/70 mt-1 text-right">
            {about.length}/500
          </p>
        </div>
      </div>

      <Link
        href="/profile"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại tổng quan
      </Link>
    </div>
  );
}
