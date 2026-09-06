"use client";

/**
 * ScoringForm — form chấm điểm DB-driven theo rubric SEP490 (BR-A1).
 * Khung tiêu chí (OGA 7 + TDA 9, weight, thang, ngưỡng pass) đọc từ
 * GET /api/scoring/rubric — KHÔNG hard-code trong FE.
 * Submit: PUT /api/scoring/meetings/{id}/scores; xem kết quả: GET .../summary.
 * Hệ thống chấm per nhóm (không per sinh viên) — đồng điểm cả nhóm.
 */
import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RubricItem = { code: string; weight: number };
type RubricGroup = {
  group: "OGA" | "TDA";
  weight_pct: number;
  items: RubricItem[];
};
type Rubric = {
  key: string;
  scale_max: number;
  decimals: number;
  pass_mark: number;
  groups: RubricGroup[];
};

const ITEM_LABELS: Record<string, string> = {
  introduction: "Project Introduction",
  pmp: "Project Management Plan",
  srs: "Software Requirement",
  sdd: "Software Design",
  testing: "Testing",
  user_guides: "User Guides",
  implementation: "Implementation",
  presentation: "Presentation Skills",
  qa: "Q&A",
};

export default function ScoringForm({ meetingId }: { meetingId: number }) {
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({}); // `${group}:${code}` -> mark
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/scoring/rubric`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setRubric)
      .catch((e) => setError(`Không tải được rubric từ server: ${e.message}`));
  }, []);

  const setMark = (key: string, value: string) => {
    setMarks((prev) => ({ ...prev, [key]: value }));
    setSaved(null);
  };

  const submit = useCallback(async () => {
    if (!rubric) return;
    const scores = Object.entries(marks)
      .filter(([, v]) => v !== "")
      .map(([key, v]) => {
        const [group, item_code] = key.split(":");
        return { group, item_code, mark: Number(v) };
      });
    if (!scores.length) return;
    setSaving(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
      const res = await fetch(`${API_BASE}/api/scoring/meetings/${meetingId}/scores`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ scores }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSaved(`Đã lưu ${data.upserted} điểm (logged).`);
    } catch (e) {
      setError(`Lỗi lưu điểm: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [rubric, marks, meetingId]);

  if (error && !rubric) return <p className="text-red-400 text-sm">{error}</p>;
  if (!rubric) return <p className="text-zinc-500 text-sm">Đang tải rubric từ DB…</p>;

  return (
    <div className="bg-card rounded-2xl border border-zinc-800/60 p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-zinc-100">
          Form chấm điểm — {rubric.key}
        </h2>
        <span className="text-xs text-zinc-500">
          Thang {rubric.scale_max} · Ngưỡng pass {rubric.pass_mark} · 1 chữ số thập phân
        </span>
      </div>

      {rubric.groups.map((g) => (
        <section key={g.group}>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">
            {g.group} — {g.weight_pct}%{" "}
            <span className="text-zinc-500 font-normal">chấm per nhóm</span>
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-zinc-800">
                <th className="py-2 font-medium">Hạng mục</th>
                <th className="py-2 font-medium w-20">Weight</th>
                <th className="py-2 font-medium w-28">Điểm (0–{rubric.scale_max})</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((it) => {
                const key = `${g.group}:${it.code}`;
                return (
                  <tr key={key} className="border-b border-zinc-800/40">
                    <td className="py-2 text-zinc-200">{ITEM_LABELS[it.code] ?? it.code}</td>
                    <td className="py-2 text-zinc-400">{it.weight}%</td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0}
                        max={rubric.scale_max}
                        step={0.1}
                        value={marks[key] ?? ""}
                        onChange={(e) => setMark(key, e.target.value)}
                        className="w-24 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-100"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <div className="flex items-center gap-4">
        <button
          onClick={submit}
          disabled={saving}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-semibold disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Lưu điểm"}
        </button>
        {saved && <span className="text-teal-400 text-sm">{saved}</span>}
        {error && rubric && <span className="text-red-400 text-sm">{error}</span>}
      </div>
    </div>
  );
}
