"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Question {
  id: number;
  question: string;
  hint: string;
  difficulty: string;
  persona: string;
}

interface QuestionsData {
  assessment_id?: number;
  document_id?: number;
  document_name?: string;
  persona?: string;
  questions: Question[];
  provider?: string;
}

const diffCfg: Record<string, { label: string; bg: string; txt: string }> = {
  easy: { label: "Dễ", bg: "bg-green-50", txt: "text-green-700" },
  medium: { label: "Trung bình", bg: "bg-blue-50", txt: "text-blue-600" },
  hard: { label: "Khó", bg: "bg-red-50", txt: "text-[#d32f2f]" },
};

const persCfg: Record<string, string> = {
  theory: "Giảng viên hướng dẫn",
  strict: "Hội đồng phản biện",
  enterprise: "Chuyên gia kỹ thuật",
};

export default function QuestionsPage() {
  const [data, setData] = useState<QuestionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("questionsData");
    if (raw) {
      try { setData(JSON.parse(raw)); } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const qs = data?.questions ?? [];
  const filtered = qs.filter(q =>
    !search || q.question.toLowerCase().includes(search.toLowerCase())
  );

  const difficulty = (d: string) => diffCfg[d] ?? diffCfg.medium;
  const personaLabel = (p: string) => persCfg[p] ?? p;

  if (!loading && qs.length === 0) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#0f2e82] mb-2">Chưa có câu hỏi nào</h2>
          <p className="text-gray-500 mb-4">Vui lòng tải tài liệu lên để AI phân tích và tạo câu hỏi.</p>
          <Link href="/upload" className="inline-block px-6 py-2.5 bg-[#0f2e82] text-white rounded-lg text-[14px] font-semibold hover:bg-[#1a3a9c]">
            Tải lên ngay
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1100px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-gray-500 font-medium mb-4">
          <Link href="/" className="hover:text-[#0f2e82] transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <span className="text-[#0f2e82] font-semibold">Kết quả phân tích (AI Results)</span>
        </div>

        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-bold text-[#0f2e82] mb-3">Kết quả phân tích (AI Results)</h1>
            <p className="text-[#5f6368] text-[14px] leading-relaxed">
              {data?.document_name
                ? `Dựa trên nội dung "${data.document_name}", AI đã phân tích và tạo danh sách câu hỏi cho buổi bảo vệ của bạn.`
                : "Dựa trên nội dung đồ án của bạn, AI đã phân tích và dự đoán danh sách các câu hỏi mà hội đồng phản biện có khả năng cao sẽ đặt ra."}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 min-w-[220px]">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Số câu hỏi</div>
              <div className="text-[18px] font-bold text-green-600">{qs.length} câu</div>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Tìm kiếm câu hỏi..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-full text-[14px] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0f2e82] focus:border-[#0f2e82] bg-white shadow-sm transition-shadow"
            />
          </div>
        </div>

        {/* Questions Grid */}
        {filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-12">Không tìm thấy câu hỏi phù hợp.</p>
        ) : (
          <>
            {/* Top Row: first question wide, second narrow (if >=2) */}
            {filtered.length >= 1 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Featured card (wide) */}
                <WideCard q={filtered[0]} difficulty={difficulty} personaLabel={personaLabel} />
                {/* Second card (narrow) */}
                {filtered.length >= 2 && (
                  <NarrowCard q={filtered[1]} difficulty={difficulty} personaLabel={personaLabel} />
                )}
              </div>
            )}

            {/* Bottom Grid: remaining questions */}
            {filtered.length > 2 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {filtered.slice(2).map(q => (
                  <NarrowCard key={q.id} q={q} difficulty={difficulty} personaLabel={personaLabel} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Bottom Banner */}
        <div className="bg-[#244bba] rounded-2xl p-10 flex flex-col items-start justify-center shadow-md overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-[0.03] rounded-full -mr-10 -mt-10 pointer-events-none" />
          <div className="absolute bottom-0 right-40 w-40 h-40 bg-white opacity-[0.03] rounded-full -mb-10 pointer-events-none" />

          <h2 className="text-[26px] font-bold text-white mb-3 relative z-10">Bạn muốn thử luyện tập trực tiếp?</h2>
          <p className="text-blue-100 text-[15px] max-w-xl mb-8 relative z-10 leading-relaxed font-medium">
            Vào Mock Room để thực hành trả lời các câu hỏi này với hội đồng AI ảo. Hệ thống sẽ chấm điểm và chỉnh sửa giọng điệu, phong thái của bạn.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            <button className="px-8 py-3 bg-white text-[#244bba] font-bold text-[14px] rounded-lg shadow-sm hover:bg-blue-50 transition-colors">
              Bắt đầu luyện tập ngay
            </button>
            <button className="px-8 py-3 bg-transparent border border-blue-200/40 text-white font-semibold text-[14px] rounded-lg hover:bg-white/10 transition-colors">
              Tải danh sách PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function WideCard({ q, difficulty, personaLabel }: {
  q: Question;
  difficulty: (d: string) => { label: string; bg: string; txt: string };
  personaLabel: (p: string) => string;
}) {
  const d = difficulty(q.difficulty);
  return (
    <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-4">
          <span className={`px-3 py-1 ${d.bg} ${d.txt} text-[12px] font-bold rounded-full`}>
            {personaLabel(q.persona)} / {d.label}
          </span>
          <span className="text-gray-500 text-[12px] font-semibold flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
            Độ ưu tiên cao
          </span>
        </div>
        <h3 className="text-[18px] font-bold text-[#0f2e82] mb-3 leading-snug">{q.question}</h3>
        <div className="bg-[#f8f9fa] rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-2 text-[#0f2e82] font-semibold text-[13px]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            Gợi ý từ AI:
          </div>
          <p className="text-gray-700 text-[14px] italic leading-relaxed">{q.hint}</p>
        </div>
      </div>
      <div className="flex justify-between items-center mt-2 border-t border-gray-50 pt-4">
        <span className="px-3 py-1.5 bg-green-50 text-green-700 text-[12px] font-semibold rounded-md flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
          Đã sẵn sàng
        </span>
        <button className="text-[#0f2e82] font-bold text-[13px] flex items-center gap-1 hover:underline">
          Xem chi tiết <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </button>
      </div>
    </div>
  );
}

function NarrowCard({ q, difficulty, personaLabel }: {
  q: Question;
  difficulty: (d: string) => { label: string; bg: string; txt: string };
  personaLabel: (p: string) => string;
}) {
  const d = difficulty(q.difficulty);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
      <div>
        <div className="mb-4">
          <span className={`px-3 py-1 ${d.bg} ${d.txt} text-[12px] font-bold rounded-full`}>
            {personaLabel(q.persona)} / {d.label}
          </span>
        </div>
        <h3 className="text-[16px] font-bold text-[#0f2e82] mb-5 leading-snug">{q.question}</h3>
        <div className="bg-[#f8f9fa] rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2 text-[#0f2e82] font-semibold text-[13px]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            Gợi ý:
          </div>
          <p className="text-gray-600 text-[13px] leading-relaxed">{q.hint}</p>
        </div>
      </div>
      <button className="w-full border border-gray-300 text-[#0f2e82] font-semibold text-[13px] py-2.5 rounded-full hover:bg-gray-50 transition-colors mt-auto">
        Xem chi tiết
      </button>
    </div>
  );
}
