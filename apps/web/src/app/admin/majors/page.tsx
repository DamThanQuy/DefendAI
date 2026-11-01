"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Loader2, RefreshCw, Users } from "lucide-react";
import { getMajorStats, type MajorStats } from "@/lib/api";

/**
 * Trang admin: thống kê sinh viên theo ngành học.
 * Đọc live từ GET /api/admin/major-stats (group by users.major) — số liệu thay
 * đổi ngay khi user chọn ngành lúc onboarding hoặc đổi ngành ở trang hồ sơ.
 */
export default function AdminMajorStatsPage() {
  const [stats, setStats] = useState<MajorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMajorStats();
      setStats(res.data);
    } catch {
      setError("Không tải được thống kê. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxCount = stats ? Math.max(1, ...stats.rows.map((r) => r.count)) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-primary">
        <GraduationCap className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">Báo cáo hệ thống</span>
      </div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
            Thống kê ngành học
          </h1>
          <p className="text-muted-foreground text-sm">
            Số sinh viên theo từng ngành — đọc trực tiếp từ DB, cập nhật ngay khi
            user chọn ngành lúc đăng ký hoặc đổi ngành trong hồ sơ cá nhân.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-bold shadow-[0_0_15px_hsl(var(--primary)/0.4)] hover:brightness-110 transition-all disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Làm mới
        </button>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm font-medium border bg-red-500/10 text-red-400 border-red-500/30">
          {error}
        </div>
      )}

      {/* Tổng quan */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="dark-card rounded-2xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-black font-serif text-foreground">{stats.total_students}</p>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Tổng sinh viên
              </p>
            </div>
          </div>
          <div className="dark-card rounded-2xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-black font-serif text-foreground">{stats.with_major}</p>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Đã chọn ngành
              </p>
            </div>
          </div>
          <div className="dark-card rounded-2xl p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-black font-serif text-foreground">{stats.without_major}</p>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Chưa chọn ngành
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Bar list theo ngành */}
      {stats && (
        <div className="dark-card rounded-2xl p-6">
          <h2 className="text-lg font-serif font-bold text-foreground mb-5">Chi tiết theo ngành</h2>
          {stats.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có sinh viên nào.</p>
          ) : (
            <div className="space-y-3.5">
              {stats.rows.map((row) => {
                const label = row.major ?? "Chưa cập nhật ngành";
                const percent = Math.round((row.count / maxCount) * 100);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className={`font-semibold ${row.major ? "text-foreground" : "text-amber-400"}`}>
                        {label}
                      </span>
                      <span className="text-muted-foreground font-bold tabular-nums">
                        {row.count} SV
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          row.major
                            ? "bg-gradient-to-r from-primary to-secondary"
                            : "bg-amber-500/60"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && !stats && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      <Link
        href="/admin/overview"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại tổng quan
      </Link>
    </div>
  );
}
