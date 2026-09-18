"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Settings, Bell, Lock, ArrowLeft, UserCog } from "lucide-react";

export default function ProfileSettingsPage() {
  const [emailNotif, setEmailNotif] = useState(true);
  const [mockReminder, setMockReminder] = useState(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-primary">
        <Settings className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">
          Cài đặt tài khoản
        </span>
      </div>
      <div>
        <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
          Cài đặt
        </h1>
        <p className="text-muted-foreground">
          Quản lý thông báo và bảo mật.
        </p>
      </div>

      {/* Liên kết tới trang sửa hồ sơ */}
      <Link
        href="/profile/edit"
        className="dark-card rounded-2xl p-6 flex items-center gap-4 hover:border-primary/50 transition-colors group"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <UserCog className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold mb-1">Hồ sơ cá nhân</h3>
          <p className="text-xs text-muted-foreground">
            Sửa tên hiển thị, trường học và giới thiệu về bạn.
          </p>
        </div>
        <span className="text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
          Mở →
        </span>
      </Link>

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