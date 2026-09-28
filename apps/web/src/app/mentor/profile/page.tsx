"use client";

import { useEffect, useState } from "react";
import { Award, DollarSign, Link as LinkIcon, Save, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Profile = { title: string; bio: string; linkedin: string; skills: string; hourlyRate: string };
const emptyProfile: Profile = { title: "", bio: "", linkedin: "", skills: "", hourlyRate: "0" };

export default function MentorProfilePage() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const data = user.profile_data ?? {};
    setFullName(user.full_name ?? "");
    setProfile({ title: String(data.title ?? ""), bio: String(data.bio ?? ""), linkedin: String(data.linkedin ?? ""), skills: String(data.skills ?? ""), hourlyRate: String(data.hourlyRate ?? "0") });
  }, [user]);

  function update(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}` },
        body: JSON.stringify({ full_name: fullName, profile_data: { ...user?.profile_data, ...profile } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || `Lưu thất bại (HTTP ${res.status})`);
      localStorage.setItem("user", JSON.stringify({ ...user, ...data, profile_data: data.profile_data ?? {} }));
      window.dispatchEvent(new Event("storage"));
      setStatus({ type: "ok", text: "Đã lưu thay đổi hồ sơ mentor." });
    } catch (error) {
      setStatus({ type: "err", text: error instanceof Error ? error.message : "Không thể lưu thay đổi." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div><h1 className="text-2xl font-serif font-bold text-foreground mb-2">Hồ sơ cá nhân</h1><p className="text-[14px] text-muted-foreground">Quản lý thông tin hiển thị công khai với học viên.</p></div>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:brightness-110 text-primary-foreground rounded-lg text-[14px] font-bold transition-all shadow-sm disabled:opacity-50"><Save className="w-4 h-4" /> {saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
      </div>
      {status && <p className={`mb-5 text-sm ${status.type === "ok" ? "text-teal-400" : "text-red-400"}`}>{status.text}</p>}
      <div className="space-y-6">
        <section className="bg-card border border-border rounded-xl p-6 shadow-sm"><h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4 text-primary" /> Thông tin cơ bản</h3><div className="space-y-4"><Field label="Họ và tên" value={fullName} onChange={setFullName} /><Field label="Chức danh" value={profile.title} onChange={(value) => update("title", value)} /><label className="block text-[13px] font-bold text-muted-foreground">Tiểu sử (Bio)<textarea rows={4} value={profile.bio} onChange={(e) => update("bio", e.target.value)} className="mt-1.5 w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary resize-none" /></label><label className="block text-[13px] font-bold text-muted-foreground"><span className="flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" /> Liên kết LinkedIn</span><input value={profile.linkedin} onChange={(e) => update("linkedin", e.target.value)} className="mt-1.5 w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary" /></label></div></section>
        <section className="bg-card border border-border rounded-xl p-6 shadow-sm"><h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2"><Award className="w-4 h-4 text-accent" /> Chuyên môn & Kỹ năng</h3><Field label="Kỹ năng (phân cách bằng dấu phẩy)" value={profile.skills} onChange={(value) => update("skills", value)} /></section>
        <section className="bg-card border border-border rounded-xl p-6 shadow-sm"><h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-green-500" /> Cài đặt dịch vụ</h3><Field label="Mức phí mỗi buổi (VND/giờ)" value={profile.hourlyRate} onChange={(value) => update("hourlyRate", value.replace(/[^0-9]/g, ""))} type="number" /></section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-[13px] font-bold text-muted-foreground">{label}<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary" /></label>;
}
