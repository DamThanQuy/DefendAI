"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authHeaders } from "@/hooks/useAdminData";

interface Feature { label: string; included: boolean; highlight?: boolean }
interface Plan {
  id: number; slug: string; name: string; tagline: string; icon: string;
  price: number; featured: boolean; special: boolean; features: Feature[]; active: boolean; sort_order: number;
}
type Form = Omit<Plan, "id" | "features" | "slug" | "price" | "sort_order"> & { slug: string; price: string; features: string };

const emptyForm: Form = { slug: "", name: "", tagline: "", icon: "sparkles", price: "0", featured: false, special: false, features: "", active: true };

export default function AdminSubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/subscriptions", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.error || data.detail || "Không tải được danh sách gói"} (HTTP ${res.status})`);
      setPlans(data.plans || []);
    } catch (error) { setMessage({ type: "err", text: String(error).replace("Error: ", "") }); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function edit(plan: Plan) {
    setEditingId(plan.id);
    setForm({ ...plan, price: String(plan.price), features: plan.features.map((feature) => `${feature.included ? "" : "!"}${feature.label}`).join("\n") });
    setMessage(null);
  }

  function reset() { setEditingId(null); setForm(emptyForm); }

  function randomCode() {
    update("slug", String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0"));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage(null);
    if (!/^\d{6}$/.test(form.slug)) {
      setMessage({ type: "err", text: "Mã gói phải có đúng 6 chữ số. Hãy bấm Random mã." });
      setSaving(false);
      return;
    }
    if (!form.name.trim()) {
      setMessage({ type: "err", text: "Tên gói không được để trống." });
      setSaving(false);
      return;
    }
    if (!/^\d{1,7}$/.test(form.price)) {
      setMessage({ type: "err", text: "Giá phải là số nguyên từ 0 đến 9,999,999 VND, không nhập chữ hoặc ký tự khác." });
      setSaving(false);
      return;
    }
    const payload = { slug: form.slug, name: form.name, tagline: form.tagline, price: Number(form.price), featured: form.featured, special: form.special, active: form.active, features: form.features.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => ({ label: line.replace(/^!/, ""), included: !line.startsWith("!") })) };
    try {
      const res = await fetch(editingId ? `/api/admin/subscriptions/${editingId}` : "/api/admin/subscriptions", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.error || data.detail || "Lưu gói thất bại"} (HTTP ${res.status})`);
      setMessage({ type: "ok", text: editingId ? "Đã cập nhật gói." : "Đã thêm gói mới." });
      reset(); await load();
    } catch (error) { setMessage({ type: "err", text: String(error).replace("Error: ", "") }); }
    finally { setSaving(false); }
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Xóa gói ${plan.name}?`)) return;
    const res = await fetch(`/api/admin/subscriptions/${plan.id}`, { method: "DELETE", headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) setMessage({ type: "err", text: `${data.error || data.detail || "Xóa gói thất bại"} (HTTP ${res.status})` });
    else { setMessage({ type: "ok", text: "Đã xóa gói." }); await load(); }
  }

  const update = (key: keyof Form, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));

  return <div className="max-w-6xl mx-auto space-y-6">
    <div><h1 className="text-2xl font-serif font-bold">Quản lý gói subscription</h1><p className="text-sm text-muted-foreground mt-1">Thêm, sửa, xóa và bật/tắt các gói hiển thị cho sinh viên.</p></div>
    {message && <p className={message.type === "ok" ? "text-sm text-teal-400" : "text-sm text-red-400"}>{message.text}</p>}
    <Card><CardHeader><CardTitle>{editingId ? "Chỉnh sửa gói" : "Thêm gói mới"}</CardTitle></CardHeader><CardContent><form noValidate onSubmit={save} className="grid gap-4 md:grid-cols-2">
      <div className="flex gap-2"><Input readOnly required placeholder="Mã gói 6 chữ số" value={form.slug} /><Button type="button" variant="outline" onClick={randomCode}>Random mã</Button></div>
      <Input required placeholder="Tên gói" value={form.name} onChange={(e) => update("name", e.target.value)} />
      <Input placeholder="Mô tả ngắn" value={form.tagline} onChange={(e) => update("tagline", e.target.value)} />
      <div className="relative"><Input required inputMode="numeric" maxLength={9} placeholder="Giá" value={form.price ? Number(form.price).toLocaleString("en-US") : ""} onChange={(e) => update("price", e.target.value.replace(/[^0-9]/g, "").slice(0, 7))} /><span className="absolute right-3 top-2.5 text-sm text-muted-foreground">VND</span></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.featured} onChange={(e) => update("featured", e.target.checked)} /> Gói nổi bật</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.special} onChange={(e) => update("special", e.target.checked)} /> Gói đặc biệt</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => update("active", e.target.checked)} /> Đang hiển thị</label>
      <textarea className="min-h-32 rounded-md border border-input bg-background p-3 text-sm md:col-span-2" placeholder="Danh sách tính năng, mỗi dòng một tính năng" value={form.features} onChange={(e) => update("features", e.target.value)} />
      <div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : editingId ? "Cập nhật gói" : "Thêm gói"}</Button>{editingId && <Button type="button" variant="outline" onClick={reset}>Hủy sửa</Button>}</div>
    </form></CardContent></Card>
    <Card><CardHeader><CardTitle>Danh sách gói</CardTitle></CardHeader><CardContent>{loading ? <p className="text-sm text-muted-foreground">Đang tải...</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-2">Tên</th><th className="py-2">Mã</th><th className="py-2">Giá</th><th className="py-2">Trạng thái</th><th className="py-2 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-border/60">{plans.map((plan) => <tr key={plan.id}><td className="py-3 font-medium">{plan.name}</td><td className="py-3 text-muted-foreground">{plan.slug}</td><td className="py-3">{plan.price.toLocaleString("vi-VN")} VND</td><td className="py-3">{plan.active ? <span className="text-teal-400">Active</span> : <span className="text-muted-foreground">Unactive</span>}</td><td className="py-3 text-right whitespace-nowrap"><button className="text-teal-400 hover:underline" onClick={() => edit(plan)}>Sửa</button><button className="ml-4 text-red-400 hover:underline" onClick={() => remove(plan)}>Xóa</button></td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}
