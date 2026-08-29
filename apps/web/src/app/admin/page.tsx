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

  // Quản lý người dùng
  interface UserRow {
    id: number;
    username: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    roles: string[];
    created_at: string | null;
  }
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userMsg, setUserMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [userSaving, setUserSaving] = useState<number | null>(null);

  // Giám sát code review (oversight)
  interface ReviewRow {
    analysis_id: number;
    document_name: string;
    user_email: string;
    status: string;
    total_files: number | null;
    stats: Record<string, number> | null;
    created_at: string | null;
  }
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewDetail, setReviewDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── AI Provider / Model / Feature config (DB là nguồn chính) ──
  interface AIModelRow { id: number; provider_name: string; model_id: string }
  interface AIProviderRow {
    name: string;
    base_url: string;
    enabled: boolean;
    source?: string; // 'db' | 'env' — nguồn cấu hình đang chạy
    runtime_model?: string | null;
    models: { id: number; model_id: string }[];
  }
  const [aiProviders, setAiProviders] = useState<AIProviderRow[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiMsg, setAiMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [newProvider, setNewProvider] = useState({ name: "", base_url: "", api_key: "" });
  const [newModel, setNewModel] = useState({ provider_name: "", model_id: "" });
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; detail: string }>>({});

  // Feature → provider/model mapping
  const FEATURE_LABELS: Record<string, string> = {
    chat: "Chat hỏi đáp tài liệu",
    workspace_chat: "Chat trong workspace",
    code_review: "Code review AI",
    mock_qa: "Mock room Q&A",
    question_gen: "Sinh câu hỏi phản biện",
    classify: "Phân loại deliverable",
    feedback: "Feedback sau mock",
  };
  const [featureConfig, setFeatureConfig] = useState<Record<string, { provider_name: string; model_id: string | null } | null>>({});
  const [featureDraft, setFeatureDraft] = useState<Record<string, { provider_name: string; model_id: string }>>({});

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

  const loadUsers = async () => {
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
  };

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

  const loadReviews = async () => {
    try {
      const res = await fetch("/api/admin/code-reviews", { headers: authHeaders() });
      const data = await res.json();
      if (data.items) setReviews(data.items);
      else setUserMsg({ type: "err", text: data.error || "Không tải được code review" });
    } catch {
      setUserMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setReviewsLoading(false);
    }
  };

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

  useEffect(() => {
    loadUsers();
    loadReviews();
    loadAIConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── AI Provider / Model / Feature config loaders & actions ──
  const loadAIConfig = async () => {
    setAiLoading(true);
    try {
      const [provRes, featRes] = await Promise.all([
        fetch("/api/admin/ai-providers", { headers: authHeaders() }),
        fetch("/api/admin/feature-ai-config", { headers: authHeaders() }),
      ]);
      const provData = await provRes.json();
      const featData = await featRes.json();
      if (provData.providers) {
        setAiProviders(provData.providers);
        setNewModel((m) => ({ ...m, provider_name: m.provider_name || provData.providers[0]?.name || "" }));
      } else {
        setAiMsg({ type: "err", text: provData.error || provData.detail || "Không tải được provider" });
      }
      if (featData.config) {
        setFeatureConfig(featData.config);
        const draft: Record<string, { provider_name: string; model_id: string }> = {};
        for (const f of featData.features ?? []) {
          const cfg = featData.config[f];
          draft[f] = { provider_name: cfg?.provider_name ?? "", model_id: cfg?.model_id ?? "" };
        }
        setFeatureDraft(draft);
      }
    } catch {
      setAiMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setAiLoading(false);
    }
  };

  const addProvider = async () => {
    if (!newProvider.name.trim() || !newProvider.base_url.trim()) return;
    setAiBusy("add-provider");
    setAiMsg(null);
    try {
      const res = await fetch("/api/admin/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          name: newProvider.name.trim(),
          base_url: newProvider.base_url.trim(),
          api_key: newProvider.api_key,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMsg({ type: "err", text: data.detail || "Thêm provider thất bại" });
        return;
      }
      setAiMsg({ type: "ok", text: `Đã thêm provider "${newProvider.name.trim()}".` });
      setNewProvider({ name: "", base_url: "", api_key: "" });
      await loadAIConfig();
    } catch {
      setAiMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setAiBusy(null);
    }
  };

  const deleteProvider = async (name: string) => {
    if (!confirm(`Xoá provider "${name}"? (cascade: models + cấu hình chức năng trỏ tới)`)) return;
    setAiBusy(`del-${name}`);
    setAiMsg(null);
    try {
      const res = await fetch(`/api/admin/ai-providers?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiMsg({ type: "err", text: data.detail || "Xoá provider thất bại" });
        return;
      }
      setAiMsg({ type: "ok", text: `Đã xoá provider "${name}".` });
      await loadAIConfig();
    } catch {
      setAiMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setAiBusy(null);
    }
  };

  const testProvider = async (name: string) => {
    setAiBusy(`test-${name}`);
    setAiMsg(null);
    try {
      const res = await fetch(`/api/admin/ai-providers/test?name=${encodeURIComponent(name)}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setTestResult((t) => ({ ...t, [name]: { ok: !!data.ok, detail: data.detail || "" } }));
    } catch {
      setTestResult((t) => ({ ...t, [name]: { ok: false, detail: "Không kết nối được máy chủ" } }));
    } finally {
      setAiBusy(null);
    }
  };

  const addModel = async () => {
    if (!newModel.provider_name || !newModel.model_id.trim()) return;
    setAiBusy("add-model");
    setAiMsg(null);
    try {
      const res = await fetch("/api/admin/ai-models", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          provider_name: newModel.provider_name,
          model_id: newModel.model_id.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMsg({ type: "err", text: data.detail || "Thêm model thất bại" });
        return;
      }
      setAiMsg({ type: "ok", text: `Đã thêm model "${newModel.model_id.trim()}".` });
      setNewModel((m) => ({ ...m, model_id: "" }));
      await loadAIConfig();
    } catch {
      setAiMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setAiBusy(null);
    }
  };

  const deleteModel = async (modelId: number, mid: string) => {
    if (!confirm(`Xoá model "${mid}"?`)) return;
    setAiBusy(`del-model-${modelId}`);
    setAiMsg(null);
    try {
      const res = await fetch(`/api/admin/ai-models?id=${modelId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiMsg({ type: "err", text: data.detail || "Xoá model thất bại" });
        return;
      }
      setAiMsg({ type: "ok", text: `Đã xoá model "${mid}".` });
      await loadAIConfig();
    } catch {
      setAiMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setAiBusy(null);
    }
  };

  const saveFeature = async (feature: string) => {
    const draft = featureDraft[feature];
    if (!draft?.provider_name) return;
    // Backend yêu cầu model_id cụ thể — rỗng thì lấy model đầu tiên của provider
    const models = aiProviders.find((p) => p.name === draft.provider_name)?.models ?? [];
    const modelId = draft.model_id || models[0]?.model_id || "";
    if (!modelId) {
      setAiMsg({ type: "err", text: `Provider "${draft.provider_name}" chưa có model nào. Hãy thêm model trước.` });
      return;
    }
    setAiBusy(`feat-${feature}`);
    setAiMsg(null);
    try {
      const res = await fetch("/api/admin/feature-ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          feature,
          provider_name: draft.provider_name,
          model_id: modelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMsg({ type: "err", text: data.detail || "Lưu cấu hình chức năng thất bại" });
        return;
      }
      setAiMsg({ type: "ok", text: `Đã lưu cấu hình cho "${FEATURE_LABELS[feature] ?? feature}".` });
      await loadAIConfig();
    } catch {
      setAiMsg({ type: "err", text: "Không kết nối được máy chủ" });
    } finally {
      setAiBusy(null);
    }
  };

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

        {/* ── AI Provider / Model / Feature config (DB là nguồn chính) ── */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>🤖 AI Provider & Model (DB)</CardTitle>
            <CardDescription>
              Thêm provider/model cho hệ thống, test kết nối, và chọn model cho từng chức năng AI.
              Lưu DB — áp dụng runtime trong ≤30s, không cần restart.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {aiLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải cấu hình AI...</p>
            ) : (
              <>
                {aiMsg && (
                  <p className={`text-sm font-medium ${aiMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
                    {aiMsg.text}
                  </p>
                )}

                {/* Danh sách provider + models */}
                <div className="space-y-3">
                  {aiProviders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Chưa có provider nào trong DB.</p>
                  ) : (
                    aiProviders.map((p) => (
                      <div key={p.name} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <span className="font-semibold text-zinc-100">{p.name}</span>
                            <span className={`ml-2 px-2 py-0.5 text-[11px] font-bold rounded-full ${p.enabled ? "bg-teal-500/10 text-teal-400" : "bg-zinc-700/40 text-zinc-400"}`}>
                              {p.enabled ? "enabled" : "disabled"}
                            </span>
                            <span
                              className={`ml-1 px-2 py-0.5 text-[11px] font-bold rounded-full ${
                                p.source === "db"
                                  ? "bg-blue-500/10 text-blue-400"
                                  : p.source === "env"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-zinc-700/40 text-zinc-400"
                              }`}
                              title={p.source === "db" ? "Cấu hình từ DB (admin quản lý)" : p.source === "env" ? "Cấu hình từ file .env" : "Nguồn không xác định"}
                            >
                              {p.source === "db" ? "● DB" : p.source === "env" ? "● ENV" : "● ?"}
                            </span>
                            {p.runtime_model && (
                              <span className="ml-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-violet-500/10 text-violet-400">
                                {p.runtime_model}
                              </span>
                            )}
                            <p className="text-[12px] text-zinc-500">{p.base_url}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => testProvider(p.name)}
                              disabled={aiBusy === `test-${p.name}`}
                              className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors disabled:opacity-50"
                            >
                              {aiBusy === `test-${p.name}` ? "Đang test..." : "🔌 Test"}
                            </button>
                            <button
                              onClick={() => deleteProvider(p.name)}
                              disabled={aiBusy === `del-${p.name}`}
                              className="px-3 py-1 text-[12px] font-semibold text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                              🗑 Xoá
                            </button>
                          </div>
                        </div>
                        {testResult[p.name] && (
                          <p className={`text-[12px] ${testResult[p.name].ok ? "text-teal-400" : "text-red-400"}`}>
                            {testResult[p.name].ok ? "✅" : "❌"} {testResult[p.name].detail}
                          </p>
                        )}
                        {p.models.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {p.models.map((m) => (
                              <span key={m.id} className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 rounded-lg text-[12px] text-zinc-300">
                                {m.model_id}
                                <button
                                  onClick={() => deleteModel(m.id, m.model_id)}
                                  disabled={aiBusy === `del-model-${m.id}`}
                                  className="text-red-400 hover:text-red-300 disabled:opacity-50"
                                  title="Xoá model"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Thêm provider mới */}
                <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
                  <p className="text-[13px] font-semibold text-zinc-200">Thêm provider mới</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Input
                      value={newProvider.name}
                      onChange={(e) => setNewProvider((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Tên provider (VD: nvidia)"
                    />
                    <Input
                      value={newProvider.base_url}
                      onChange={(e) => setNewProvider((s) => ({ ...s, base_url: e.target.value }))}
                      placeholder="Base URL (VD: http://localhost:20128/v1)"
                    />
                    <Input
                      type="password"
                      value={newProvider.api_key}
                      onChange={(e) => setNewProvider((s) => ({ ...s, api_key: e.target.value }))}
                      placeholder="API key (tùy chọn)"
                    />
                  </div>
                  <Button onClick={addProvider} disabled={aiBusy === "add-provider" || !newProvider.name.trim() || !newProvider.base_url.trim()}>
                    {aiBusy === "add-provider" ? "Đang thêm..." : "+ Thêm provider"}
                  </Button>
                </div>

                {/* Thêm model cho provider */}
                <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
                  <p className="text-[13px] font-semibold text-zinc-200">Thêm model cho provider</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={newModel.provider_name}
                      onChange={(e) => setNewModel((s) => ({ ...s, provider_name: e.target.value }))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-[13px] text-zinc-300 focus:outline-none focus:border-primary"
                    >
                      <option value="">— Chọn provider —</option>
                      {aiProviders.map((p) => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                    <Input
                      value={newModel.model_id}
                      onChange={(e) => setNewModel((s) => ({ ...s, model_id: e.target.value }))}
                      placeholder="Model ID (VD: gemma-4-31b-it)"
                    />
                  </div>
                  <Button onClick={addModel} disabled={aiBusy === "add-model" || !newModel.provider_name || !newModel.model_id.trim()}>
                    {aiBusy === "add-model" ? "Đang thêm..." : "+ Thêm model"}
                  </Button>
                </div>

                {/* Feature → provider/model mapping */}
                <div className="rounded-xl border border-zinc-800 p-4 space-y-3">
                  <p className="text-[13px] font-semibold text-zinc-200">Chọn model cho từng chức năng</p>
                  <div className="space-y-2">
                    {Object.keys(FEATURE_LABELS).map((feature) => {
                      const draft = featureDraft[feature] ?? { provider_name: "", model_id: "" };
                      const models = aiProviders.find((p) => p.name === draft.provider_name)?.models ?? [];
                      return (
                        <div key={feature} className="flex items-center gap-3 flex-wrap">
                          <span className="w-56 text-[13px] text-zinc-300">{FEATURE_LABELS[feature]}</span>
                          <select
                            value={draft.provider_name}
                            onChange={(e) => setFeatureDraft((s) => ({
                              ...s,
                              [feature]: { provider_name: e.target.value, model_id: "" },
                            }))}
                            className="px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-[12px] text-zinc-300 focus:outline-none focus:border-primary"
                          >
                            <option value="">— Mặc định hệ thống —</option>
                            {aiProviders.map((p) => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                          <select
                            value={draft.model_id}
                            onChange={(e) => setFeatureDraft((s) => ({
                              ...s,
                              [feature]: { ...draft, model_id: e.target.value },
                            }))}
                            className="px-2 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-[12px] text-zinc-300 focus:outline-none focus:border-primary"
                          >
                            <option value="">— Model đầu tiên —</option>
                            {models.map((m) => (
                              <option key={m.id} value={m.model_id}>{m.model_id}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => saveFeature(feature)}
                            disabled={aiBusy === `feat-${feature}` || !draft.provider_name}
                            className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors disabled:opacity-50"
                          >
                            {aiBusy === `feat-${feature}` ? "..." : "Lưu"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
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

      {/* Quản lý người dùng */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>👥 Người dùng</CardTitle>
          <CardDescription>Khoá/mở tài khoản và đổi vai trò (student / mentor / admin).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userMsg && (
            <p className={`text-sm font-medium ${userMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
              {userMsg.text}
            </p>
          )}
          {usersLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có người dùng.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Họ tên</th>
                    <th className="py-2 pr-4 font-medium">Vai trò</th>
                    <th className="py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="py-2 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-4 font-medium text-zinc-200">{u.email}</td>
                      <td className="py-2 pr-4 text-zinc-400">{u.full_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <select
                          value={u.roles[0] ?? "student"}
                          disabled={userSaving === u.id}
                          onChange={(e) => updateUser(u.id, { roles: [e.target.value] })}
                          className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded-lg text-[12px] text-zinc-300 focus:outline-none focus:border-primary"
                        >
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${u.is_active ? "bg-teal-500/10 text-teal-400" : "bg-red-500/10 text-red-400"}`}>
                          {u.is_active ? "Hoạt động" : "Khoá"}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                          disabled={userSaving === u.id}
                          className="px-3 py-1 text-[12px] font-semibold text-zinc-200 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                        >
                          {u.is_active ? "Khoá" : "Mở"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Giám sát code review (oversight) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>📊 Đánh giá AI — Code Review</CardTitle>
          <CardDescription>Xem mọi lượt quét của mọi user (giám sát hệ thống).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reviewsLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lượt code review nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-500">
                    <th className="py-2 pr-4 font-medium">User</th>
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="py-2 pr-4 font-medium text-right">Files</th>
                    <th className="py-2 pr-4 font-medium">Thống kê</th>
                    <th className="py-2 font-medium text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {reviews.map((r) => (
                    <tr key={r.analysis_id}>
                      <td className="py-2 pr-4 font-medium text-zinc-200">{r.user_email}</td>
                      <td className="py-2 pr-4 text-zinc-400">{r.document_name}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${r.status === "completed" ? "bg-teal-500/10 text-teal-400" : r.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-zinc-700/40 text-zinc-300"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400">{r.total_files ?? "—"}</td>
                      <td className="py-2 pr-4 text-zinc-500">
                        {r.stats ? Object.entries(r.stats).map(([k, v]) => `${k}:${v}`).join(" · ") : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => openReview(r.analysis_id)}
                          className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detailLoading && <p className="text-sm text-muted-foreground">Đang tải chi tiết...</p>}
          {reviewDetail && (
            <div className="bg-zinc-900/60 rounded-xl p-4 space-y-2 max-h-80 overflow-y-auto">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-semibold text-primary">Chi tiết analysis</span>
                <button onClick={() => setReviewDetail(null)} className="text-[12px] text-zinc-400 hover:text-zinc-200">Đóng</button>
              </div>
              {reviewDetail.error ? (
                <p className="text-[12px] text-red-400">{String(reviewDetail.error)}</p>
              ) : (
                <pre className="text-[12px] text-zinc-400 whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      status: reviewDetail.status,
                      summary: reviewDetail.summary,
                      total_files: reviewDetail.total_files,
                      stats: reviewDetail.stats,
                      issues_count: Array.isArray(reviewDetail.issues) ? reviewDetail.issues.length : 0,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
                          <td className="py-2 pr-4 text-zinc-500">{new Date(it.updated_at + "Z").toLocaleString("vi-VN")}</td>
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
