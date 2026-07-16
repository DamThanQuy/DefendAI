"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

interface Assessment {
  project: string;
  persona: string;
  files: { name: string; size: string }[];
  radar: { label: string; score: number }[];
  questions: { group: string; items: { q: string; hint: string }[] }[];
  codeReview: {
    tree: { type: string; name: string }[];
    notes: { file: string; line: number; severity: string; message: string }[];
  };
  diagnosis: string;
}

export default function DemoPage() {
  const [data, setData] = useState<Assessment | null>(null);

  useEffect(() => {
    fetch("/demo/sample-assessment.json")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Đang tải demo...
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-12">
      {/* Demo banner */}
      <div className="mb-8 flex flex-col items-start gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            Đây là kết quả mẫu (không tốn API)
          </div>
          <p className="text-sm text-muted-foreground">
            Đăng ký miễn phí để AI phân tích đồ án thật của bạn với cùng chất lượng này.
          </p>
        </div>
        <Link href="/register">
          <Button className="rounded-full group">
            <span className="flex items-center gap-2">
              Đăng ký miễn phí
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Button>
        </Link>
      </div>

      <h1 className="mb-2 text-4xl font-serif font-bold">Kết quả AI mẫu</h1>
      <p className="mb-8 text-muted-foreground">
        Dự án: <span className="font-medium text-foreground">{data.project}</span> · Giám khảo: {data.persona}
      </p>

      {/* Files + Radar */}
      <div className="mb-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
            <FileText className="h-4 w-4" /> Tệp đã phân tích
          </h3>
          <ul className="space-y-2">
            {data.files.map((f) => (
              <li key={f.name} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{f.name}</span>
                <span className="text-muted-foreground">{f.size}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-primary">Năng lực (Radar)</h3>
          <div className="space-y-3">
            {data.radar.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-foreground">{r.label}</span>
                  <span className="text-muted-foreground">{r.score}/10</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${r.score * 10}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="mb-10">
        <h2 className="mb-4 text-2xl font-serif font-bold">Câu hỏi phản biện</h2>
        <div className="space-y-6">
          {data.questions.map((g) => (
            <div key={g.group}>
              <h3 className="mb-3 inline-block rounded-md bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                {g.group}
              </h3>
              <div className="space-y-2">
                {g.items.map((item) => (
                  <div key={item.q} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <p className="text-sm text-foreground">{item.q}</p>
                    <p className="mt-2 text-xs text-accent">💡 Gợi ý: {item.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Code review */}
      <div className="mb-10">
        <h2 className="mb-4 text-2xl font-serif font-bold">Code Review</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 font-mono text-sm shadow-sm">
            {data.codeReview.tree.map((t) => (
              <div key={t.name} className={t.type === "folder" ? "font-semibold text-foreground" : "pl-5 text-muted-foreground"}>
                {t.type === "folder" ? "📁 " : "📄 "}
                {t.name}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {data.codeReview.notes.map((n, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 text-sm ${
                  n.severity === "error"
                    ? "border-red-500/30 bg-red-500/5 text-red-300"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-300"
                }`}
              >
                <span className="font-mono text-xs opacity-80">{n.file}:{n.line}</span> — {n.message}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Diagnosis */}
      <div className="mb-10 flex items-start gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary">Bệnh án đồ án</h3>
          <p className="text-sm text-foreground">{data.diagnosis}</p>
        </div>
      </div>

      <div className="text-center">
        <Link href="/register">
          <Button size="lg" className="rounded-full">
            Tạo kết quả như này cho đồ án của bạn
          </Button>
        </Link>
      </div>
    </div>
  );
}
