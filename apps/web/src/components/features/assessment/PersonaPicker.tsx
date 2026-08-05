"use client";

import React from "react";
import { PERSONAS } from "@/lib/constants";

type Props = {
  value: string;
  onChange: (key: string) => void;
};

/** Chọn giám khảo AI (persona). Dùng chung cho UploadZone và popup phân tích từ list. */
export function PersonaPicker({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      {PERSONAS.map((p) => (
        <div
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
            value === p.key ? "border-primary bg-teal-500/10" : "border-zinc-700 hover:border-primary/40"
          }`}
        >
          <h5 className={`text-[14px] font-bold ${value === p.key ? "text-primary" : "text-zinc-200"}`}>{p.label}</h5>
          <p className="text-[12px] text-zinc-500 mt-0.5">{p.description}</p>
        </div>
      ))}
    </div>
  );
}