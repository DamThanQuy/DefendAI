"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface Question {
  id: number;
  question: string;
  difficulty: string;
  suggestion: string;
  persona?: string;
}

const difficultyStyle: Record<string, { bg: string; text: string; label: string }> = {
  "Khó": { bg: "bg-critical-bg", text: "text-critical", label: "Cốt lõi / Khó" },
  "Trung bình": { bg: "bg-blue-950/40", text: "text-blue-400", label: "Kiến trúc / Trung bình" },
  "Dễ": { bg: "bg-success-bg", text: "text-success", label: "Hiệu năng / Dễ" },
};

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("questionsData");
    if (stored) {
      try {
        setQuestions(JSON.parse(stored));
      } catch (e) {
        console.error("Lỗi parse questionsData:", e);
      }
    }
  }, []);

  const filtered = questions.filter((q) => {
    if (filter !== "all" && q.difficulty !== filter) return false;
    if (search && !q.question.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1100px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-muted-foreground font-medium mb-4 font-mono">
          <Link href="/" className="hover:text-teal-400 transition-colors">Trang chủ</Link>
          <span className="mx-2">&rsaquo;</span>
          <span className="text-teal-400 font-semibold">Kết quả phân tích (AI Results)</span>
        </div>

        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-bold text-teal-400 mb-3">Kết quả phân tích (AI Results)</h1>
            <p className="text-muted-foreground text-[14px] leading-relaxed">
              Dựa trên nội dung đồ án của bạn, AI đã phân tích và dự đoán danh sách các câu hỏi mà hội đồng phản biện có khả năng cao sẽ đặt ra.
            </p>
          </div>
          <div className="bg-surface rounded-2xl border border-border p-5 flex items-center gap-4 min-w-[280px] shadow-glow">
            <div className="w-10 h-10 rounded-full bg-success-bg flex items-center justify-center text-success shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 font-mono">Tổng số câu hỏi</div>
              <div className="text-[18px] font-bold text-teal-400 font-mono">{questions.length} câu hỏi</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <input
            type="text"
            placeholder="Tìm kiếm câu hỏi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block flex-1 max-w-sm px-4 py-2 border border-border rounded-full text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary bg-surface shadow-sm font-mono"
          />
          <div className="flex gap-3">
            {[
              { value: "all", label: "Tất cả" },
              { value: "Khó", label: "Khó" },
              { value: "Trung bình", label: "TB" },
              { value: "Dễ", label: "Dễ" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-full text-[13px] font-semibold border transition-all duration-200 ${
                  filter === f.value
                    ? "bg-teal-500 text-primary-foreground border-teal-500 shadow-glow"
                    : "bg-surface border-border text-foreground hover:border-teal-700 hover:text-teal-400"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Questions Grid */}
        {questions.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-medium">Chưa có câu hỏi nào.</p>
            <p className="text-sm mt-2">Hãy upload tài liệu trên trang chủ để AI sinh câu hỏi.</p>
            <Link href="/" className="inline-block mt-4 px-6 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-full text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all duration-200">
              Về trang chủ
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {filtered.map((q) => {
              const ds = difficultyStyle[q.difficulty] || difficultyStyle["Trung bình"];
              return (
                <div key={q.id} className="bg-surface rounded-2xl border border-border p-6 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-glow">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className={`px-3 py-1 ${ds.bg} ${ds.text} text-[12px] font-bold rounded-full font-mono border border-current/30`}>
                        {ds.label}
                      </span>
                      <span className="text-muted-foreground text-[12px] font-semibold font-mono">#{q.id}</span>
                    </div>
                    <h3 className="text-[16px] font-bold text-foreground mb-4 leading-snug">{q.question}</h3>
                    {q.suggestion && (
                      <div className="bg-muted rounded-xl p-4 border border-border">
                        <div className="flex items-center gap-2 mb-2 text-teal-400 font-semibold text-[13px]">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          Gợi ý:
                        </div>
                        <p className="text-muted-foreground text-[13px] leading-relaxed italic">{q.suggestion}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
