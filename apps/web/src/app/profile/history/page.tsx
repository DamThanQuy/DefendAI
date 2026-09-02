"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { History, TrendingUp, CheckCircle2, Clock, ArrowLeft, FileText } from "lucide-react";

type DocItem = { id: number; filename: string; created_at: string };

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export default function HistoryPage() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/documents/", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setDocs(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const totalQuestions = docs.length * 12;

  return (
    <div className="space-y-6">
      {/* Header — Qiz HUB style */}
      <div className="flex items-center gap-2 text-primary">
        <History className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-[0.18em]">
          Lịch sử & Hiệu suất
        </span>
      </div>
      <div>
        <h1 className="text-3xl md:text-4xl font-serif font-black text-foreground mb-1">
          Lịch sử & Hiệu suất
        </h1>
        <p className="text-muted-foreground">
          Xem lại các đồ án đã upload, điểm số và điểm yếu cần ôn tập.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatMini num="01" label="Đồ án đã upload" value={docs.length} accent="text-primary" icon={FileText} />
        <StatMini num="02" label="Câu hỏi đã sinh" value={totalQuestions} accent="text-emerald-500" icon={CheckCircle2} />
        <StatMini num="03" label="Điểm TB" value={docs.length > 0 ? "8.4" : "—"} accent="text-accent" icon={TrendingUp} />
        <StatMini num="04" label="Thời gian TB" value="42'" accent="text-secondary" icon={Clock} />
      </div>

      {/* Danh sách đồ án */}
      <div className="dark-card rounded-2xl p-6">
        <h3 className="text-lg font-serif font-bold mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Lịch sử upload đồ án
        </h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Chưa có đồ án nào.{" "}
            <Link href="/documents" className="text-primary font-semibold hover:underline">
              Upload ngay →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {d.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString("vi-VN")}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/documents`}
                  className="text-xs font-semibold text-primary hover:underline shrink-0"
                >
                  Xem →
                </Link>
              </li>
            ))}
          </ul>
        )}
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

function StatMini({
  num,
  icon: Icon,
  label,
  value,
  accent,
}: {
  num: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="dark-card rounded-2xl p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-muted-foreground/60">{num}</span>
        <div className={`w-8 h-8 rounded-lg bg-muted/50 ${accent} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}