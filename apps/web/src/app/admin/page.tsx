"use client";

import { Fragment, useEffect, useState } from "react";
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

  // R9: tài liệu chuẩn (reference_chunks)
  interface RefItem {
    category: string;
    title: string;
    chunks: number;
    updated_at: string;
  }
  const REF_CATEGORIES: { key: string; label: string }[] = [
    { key: "textbook", label: "Giáo trình / chuẩn" },
    { key: "rubric", label: "Rubric" },
    { key: "sample_project", label: "Dự án mẫu" },
    { key: "spec", label: "Đặc tả" },
  ];
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

  const loadReference = async () => {
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
  };

  useEffect(() => {
    loadReference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Poll job (pattern: 1.5s × tối đa 60 lần)
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

  const refKey = (category: string, title: string) => `${category}|${title}`;

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

      {/* R9: Tài liệu chuẩn (reference_chunks) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>📚 Tài liệu chuẩn</CardTitle>
          <CardDescription>
            Upload rubric / giáo trình / dự án mẫu → AI hỏi đúng tiêu chí hội đồng (bảng reference_chunks, dùng chung mọi user).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>File (PDF/DOCX/PPTX/ZIP/MD)</Label>
              <input
                type="file"
                accept=".pdf,.docx,.pptx,.zip,.rar,.md"
                onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-zinc-800 file:text-zinc-200 file:text-[12px] file:font-semibold hover:file:bg-zinc-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Loại</Label>
              <select
                value={refCategory}
                onChange={(e) => setRefCategory(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-[13px] text-zinc-300 focus:outline-none focus:border-primary"
              >
                {REF_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tiêu đề</Label>
              <Input
                value={refTitle}
                onChange={(e) => setRefTitle(e.target.value)}
                placeholder="VD: Rubric bảo vệ 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nguồn (tùy chọn)</Label>
              <Input
                value={refSource}
                onChange={(e) => setRefSource(e.target.value)}
                placeholder="VD: Phòng đào tạo"
              />
            </div>
          </div>

          <Button onClick={uploadReference} disabled={!refFile || !refTitle.trim() || refRunning}>
            {refRunning ? "Đang index..." : "Upload & index"}
          </Button>

          {refMsg && (
            <p className={`text-sm font-medium ${refMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
              {refMsg.text}
            </p>
          )}

          {refLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải danh sách...</p>
          ) : refItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có tài liệu chuẩn nào được index.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Loại</th>
                    <th className="py-2 pr-4 font-medium">Tiêu đề</th>
                    <th className="py-2 pr-4 font-medium text-right">Số chunk</th>
                    <th className="py-2 pr-4 font-medium">Cập nhật lúc</th>
                    <th className="py-2 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {refItems.map((it) => {
                    const key = refKey(it.category, it.title);
                    return (
                      <Fragment key={key}>
                        <tr>
                          <td className="py-2 pr-4">
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-bold rounded-full">
                              {REF_CATEGORIES.find((c) => c.key === it.category)?.label ?? it.category}
                            </span>
                          </td>
                          <td className="py-2 pr-4 font-medium text-zinc-200">{it.title}</td>
                          <td className="py-2 pr-4 text-right text-zinc-400">{it.chunks}</td>
                          <td className="py-2 pr-4 text-zinc-500">{new Date(it.updated_at).toLocaleString("vi-VN")}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => togglePreview(it.category, it.title)}
                              className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                            >
                              {refPreview[key] ? "Ẩn" : "👁 Xem"}
                            </button>
                            <button
                              onClick={() => removeRef(it.category, it.title)}
                              disabled={refDeleting === key}
                              className="ml-2 px-3 py-1 text-[12px] font-semibold text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                              🗑 Xoá
                            </button>
                          </td>
                        </tr>
                        {refPreview[key] && (
                          <tr>
                            <td colSpan={5} className="py-2">
                              <div className="bg-zinc-900/60 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
                                {refPreview[key].map((content, i) => (
                                  <p key={i} className="text-[12px] text-zinc-400 whitespace-pre-wrap">
                                    <span className="text-primary font-semibold">#{i + 1}</span> {content}
                                  </p>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
