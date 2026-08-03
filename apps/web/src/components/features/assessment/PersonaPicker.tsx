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
            value === p.key ? "border-[#0f2e82] bg-[#e8effd]" : "border-gray-200 hover:border-[#0f2e82]/30"
          }`}
        >
          <h5 className={`text-[14px] font-bold ${value === p.key ? "text-[#0f2e82]" : "text-gray-900"}`}>{p.label}</h5>
          <p className="text-[12px] text-gray-500 mt-0.5">{p.description}</p>
        </div>
      ))}
    </div>
  );
}