"use client";

import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FIELD_META,
  REF_CATEGORIES,
  useAdminReference,
  useAdminSettings,
} from "@/hooks/useAdminData";

export default function AdminSettingsPage() {
  const { settings, loading, saving, msg, setMsg, set, save } = useAdminSettings();
  const ref = useAdminReference();

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">⚙️ Cấu hình hệ thống</h1>
        <p className="text-[14px] text-muted-foreground">Cấu hình AI provider và tài liệu chuẩn (RAG).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cấu hình AI Provider</CardTitle>
          <CardDescription>Chọn provider mặc định, base URL và model. Lưu vào DB và áp dụng ngay.</CardDescription>
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

      <Card>
        <CardHeader>
          <CardTitle>Cấu hình sàn (Hoa hồng / Tags / Vouchers)</CardTitle>
          <CardDescription>Super Admin cấu hình % hoa hồng, danh mục kỹ năng và mã giảm giá.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Tính năng đang phát triển — chưa có trong whitelist cấu hình.</p>
        </CardContent>
      </Card>

      <Card>
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
                onChange={(e) => ref.setRefFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-muted file:text-foreground file:text-[12px] file:font-semibold hover:file:bg-muted"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Loại</Label>
              <select
                value={ref.refCategory}
                onChange={(e) => ref.setRefCategory(e.target.value)}
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[13px] text-foreground focus:outline-none focus:border-primary"
              >
                {REF_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tiêu đề</Label>
              <Input
                value={ref.refTitle}
                onChange={(e) => ref.setRefTitle(e.target.value)}
                placeholder="VD: Rubric bảo vệ 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nguồn (tùy chọn)</Label>
              <Input
                value={ref.refSource}
                onChange={(e) => ref.setRefSource(e.target.value)}
                placeholder="VD: Phòng đào tạo"
              />
            </div>
          </div>

          <Button onClick={ref.uploadReference} disabled={!ref.refFile || !ref.refTitle.trim() || ref.refRunning}>
            {ref.refRunning ? "Đang index..." : "Upload & index"}
          </Button>

          {ref.refMsg && (
            <p className={`text-sm font-medium ${ref.refMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
              {ref.refMsg.text}
            </p>
          )}

          {ref.refLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải danh sách...</p>
          ) : ref.refItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có tài liệu chuẩn nào được index.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Loại</th>
                    <th className="py-2 pr-4 font-medium">Tiêu đề</th>
                    <th className="py-2 pr-4 font-medium text-right">Số chunk</th>
                    <th className="py-2 pr-4 font-medium">Cập nhật lúc</th>
                    <th className="py-2 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {ref.refItems.map((it) => {
                    const key = ref.refKey(it.category, it.title);
                    return (
                      <Fragment key={key}>
                        <tr>
                          <td className="py-2 pr-4">
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-bold rounded-full">
                              {REF_CATEGORIES.find((c) => c.key === it.category)?.label ?? it.category}
                            </span>
                          </td>
                          <td className="py-2 pr-4 font-medium text-foreground">{it.title}</td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">{it.chunks}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{new Date(it.updated_at + "Z").toLocaleString("vi-VN")}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => ref.togglePreview(it.category, it.title)}
                              className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                            >
                              {ref.refPreview[key] ? "Ẩn" : "👁 Xem"}
                            </button>
                            <button
                              onClick={() => ref.removeRef(it.category, it.title)}
                              disabled={ref.refDeleting === key}
                              className="ml-2 px-3 py-1 text-[12px] font-semibold text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                            >
                              🗑 Xoá
                            </button>
                          </td>
                        </tr>
                        {ref.refPreview[key] && (
                          <tr>
                            <td colSpan={5} className="py-2">
                              <div className="bg-card/60 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
                                {ref.refPreview[key].map((content, i) => (
                                  <p key={i} className="text-[12px] text-muted-foreground whitespace-pre-wrap">
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
    </div>
  );
}
