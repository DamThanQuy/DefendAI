"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Cấu hình provider — admin chỉnh qua UI, lưu DB, áp dụng runtime.
// ponytail: form đơn giản, không dùng react-hook-form — đủ cho 6 field tĩnh.

interface SettingsMap {
  [key: string]: string;
}

const FIELD_META: { key: string; label: string; hint: string; type?: string }[] = [
  { key: "default_provider", label: "Provider mặc định", hint: "Provider cho AI gateway (localhost | nvidia)" },
  { key: "localhost_api_key", label: "Local API key", hint: "sk-...", type: "password" },
  { key: "localhost_base_url", label: "Local URL", hint: "http://localhost:20128/v1" },
  { key: "localhost_model", label: "Local model", hint: "google" },
];

export default function AdminPage() {
  const { user, roles } = useAuth();
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    (async () => {
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
    })();
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

  return (
    <main className="container mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">Quản trị hệ thống</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Chào {user?.full_name || user?.email}, vai trò: {roles.join(", ")}
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cấu hình AI Provider</CardTitle>
            <CardDescription>
              Chọn provider mặc định, base URL và model. Lưu vào DB và áp dụng ngay.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <p className="text-sm text-muted-foreground">Đang tải cấu hình...</p>
            ) : (
              FIELD_META.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    type={f.type || "text"}
                    value={settings[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.hint}
                  />
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ))
            )}

            {msg && (
              <p className={`text-sm font-medium ${msg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
                {msg.text}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button onClick={save} disabled={loading || saving}>
                {saving ? "Đang lưu..." : "Lưu & áp dụng"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Người dùng</CardTitle>
              <CardDescription>Quản lý tài khoản, phân quyền.</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Đánh giá</CardTitle>
              <CardDescription>Xem / duyệt kết quả AI.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </main>
  );
}
