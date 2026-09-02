"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Settings, User, Bell, Lock, ArrowLeft, Save, GraduationCap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function ProfileSettingsPage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [school, setSchool] = useState("FPT University");
  const [emailNotif, setEmailNotif] = useState(true);
  const [mockReminder, setMockReminder] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user?.full_name]);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-primary">
        <Settings className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">
          Cài đặt tài khoản
        </span>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
            Cài đặt
          </h1>
          <p className="text-muted-foreground">
            Quản lý thông tin cá nhân, thông báo và bảo mật.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-bold shadow-[0_0_15px_hsl(var(--primary)/0.4)] hover:brightness-110 transition-all"
        >
          <Save className="w-4 h-4" />
          {saved ? "Đã lưu!" : "Lưu thay đổi"}
        </button>
      </div>

      {/* Thông tin cá nhân */}
      <div className="dark-card rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold mb-1">Thông tin cá nhân</h3>
            <p className="text-xs text-muted-foreground">
              Tên hiển thị và trường đang theo học.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
              Họ và tên
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={user?.email ?? ""}
              disabled
              className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-lg text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" />
              Trường đang theo học
            </label>
            <input
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Thông báo */}
      <div className="dark-card rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold mb-1">Thông báo</h3>
            <p className="text-xs text-muted-foreground">
              Chọn loại thông báo bạn muốn nhận.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <Toggle
            label="Thông báo qua email"
            desc="Nhận email khi có phiên mock hoặc điểm số mới."
            checked={emailNotif}
            onChange={setEmailNotif}
          />
          <Toggle
            label="Nhắc nhở lịch mock"
            desc="Nhắc nhở trước 1 giờ khi phiên mock defense bắt đầu."
            checked={mockReminder}
            onChange={setMockReminder}
          />
        </div>
      </div>

      {/* Bảo mật */}
      <div className="dark-card rounded-2xl p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold mb-1">Bảo mật</h3>
            <p className="text-xs text-muted-foreground">
              Đổi mật khẩu và quản lý phiên đăng nhập.
            </p>
          </div>
        </div>
        <button className="px-5 py-2.5 text-sm font-semibold border border-border rounded-lg hover:bg-muted transition-colors">
          Đổi mật khẩu
        </button>
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

function Toggle({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}