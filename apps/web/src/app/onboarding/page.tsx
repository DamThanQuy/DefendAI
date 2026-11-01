"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAJORS } from "@/constants/majors";
import { clearSession } from "@/lib/auth";
import { getMe, updateMe } from "@/lib/api";

/**
 * Bước onboarding sau đăng ký: chọn ngành học TRƯỚC khi vào màn hình chính.
 *
 * Luồng: /register (form KHÔNG hỏi ngành) → đăng ký xong redirect sang đây
 * (AuthSlider.handleRegister) → chọn ngành → PUT /api/auth/me lưu major →
 * /documents (Product Tour sẽ tự mở ở đó).
 *
 * Guard ở AppShell đá mọi student chưa có major về đây, nên route này tự xử lý:
 * - Chưa login → /login (AuthGate không liệt kê route này trong PROTECTED_PATHS).
 * - Đã có major (user cũ / F5 sau khi chọn) → cập nhật cache rồi vào thẳng
 *   /documents — việc ghi major vào cache TRƯỚC khi replace là bắt buộc để
 *   không tạo vòng lặp với guard (cache cũ thiếu major → guard đá lại vào đây).
 */

/** Chuẩn hoá `detail` 422 của FastAPI (mảng object) về chuỗi để render an toàn. */
function detailToString(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) =>
        typeof d === "object" && d !== null ? (d as { msg?: unknown }).msg : d,
      )
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    if (msgs.length > 0) return msgs.join(", ");
  }
  return fallback;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState("");
  const [major, setMajor] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  /** Ghi major vào cache user + bắn storage event để useAuth/useAuth-guard nhìn thấy ngay. */
  function mergeMajorToCache(value: string) {
    try {
      const raw = localStorage.getItem("user");
      const user = raw ? JSON.parse(raw) : {};
      localStorage.setItem("user", JSON.stringify({ ...user, major: value }));
      window.dispatchEvent(new Event("storage"));
    } catch {
      // Cache hỏng thì bỏ qua — useAuth sẽ tự đồng bộ lại từ /me.
    }
  }

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    getMe()
      .then((res) => {
        if (cancelled) return;
        const me = res.data;
        if (me.major) {
          mergeMajorToCache(me.major);
          router.replace("/documents");
          return;
        }
        setFullName(me.full_name ?? "");
        setChecking(false);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!major) {
      setError("Vui lòng chọn ngành học để tiếp tục.");
      return;
    }
    setSaving(true);
    try {
      const res = await updateMe({ major });
      mergeMajorToCache(res.data.major ?? major);
      router.replace("/documents");
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        .response?.data?.detail;
      setError(detailToString(detail, "Không lưu được ngành học. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    clearSession();
    window.dispatchEvent(new Event("storage"));
    window.location.href = "/login";
  }

  if (checking) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-[80vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/30">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
        </div>

        <h1 className="text-center text-2xl font-extrabold tracking-tight text-slate-900">
          Chào mừng{fullName ? `, ${fullName}` : ""}! 👋
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Trước khi bắt đầu, cho mình hỏi:{" "}
          <span className="font-semibold">bạn đang học ngành gì?</span> Thông tin này giúp
          chúng mình cá nhân hoá nội dung luyện tập bảo vệ cho bạn.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="major" className="font-semibold text-slate-700">
              Ngành học của bạn
            </Label>
            <div className="relative">
              <GraduationCap className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <select
                id="major"
                value={major}
                onChange={(e) => setMajor(e.target.value)}
                className={`h-12 w-full rounded-xl border border-zinc-300 bg-white pl-11 pr-3 text-sm transition-colors focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 ${
                  major ? "text-zinc-900" : "text-muted-foreground"
                }`}
              >
                <option value="" disabled>
                  — Chọn ngành học —
                </option>
                {MAJORS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-primary to-secondary text-base font-semibold text-white shadow-lg shadow-primary/30 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-xl"
          >
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            Bắt đầu ngay
          </Button>
        </form>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Đăng xuất
        </button>
      </div>
    </div>
  );
}
