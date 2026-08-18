"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Question {
  id: number;
  question: string;
  hint: string;
  difficulty: string;
}

interface AssessmentResponse {
  assessment_id: number;
  document_id: number;
  document_name: string;
  status: string;
  chunks_count: number;
  questions: Question[];
  provider: string;
  model: string;
  missing_submissions?: Array<{ key: string; label: string; week: number }>;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export default function QuestionsPage() {
  const [data, setData] = useState<AssessmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchAssessment = async () => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const r = await fetch("/api/questions/assessments/latest", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error("Failed to fetch assessment");
        const json: AssessmentResponse = await r.json();
        setData(json);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAssessment();
  }, []);

  const missing = data?.missing_submissions ?? [];
  const questions = data?.questions ?? [];

  return (
    <div className="min-h-screen pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1100px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-muted-foreground font-medium mb-4">
          <Link href="/" className="hover:text-primary transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <span className="text-primary font-semibold">Kết quả phân tích (AI Results)</span>
        </div>

        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-serif font-bold text-primary mb-3">Kết quả phân tích (AI Results)</h1>
            <p className="text-muted-foreground text-[14px] leading-relaxed">
              Dựa trên nội dung đồ án của bạn, AI đã phân tích và dự đoán danh sách các câu hỏi mà hội đồng phản biện có khả năng cao sẽ đặt ra. Hãy chuẩn bị kỹ lưỡng để đạt kết quả tốt nhất.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5 flex items-center gap-4 min-w-[280px]">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${missing.length > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {missing.length > 0 ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                )}
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Trạng thái tổng quan</div>
              <div className={`text-[18px] font-bold ${missing.length > 0 ? "text-red-500" : "text-green-500"}`}>
                {missing.length > 0 ? `Thiếu ${missing.length} báo cáo` : "Đã chuẩn bị tốt"}
              </div>
            </div>
          </div>
        </div>

        {/* Missing submissions warning */}
        {missing.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <h3 className="text-red-400 font-bold text-[14px] mb-1">Cảnh báo: Còn thiếu báo cáo bắt buộc</h3>
                <p className="text-red-300/90 text-[13px]">
                  Nhóm chưa nộp: {missing.map(m => `${m.label} (tuần ${m.week})`).join(", ")}.
                  Hội đồng có thể hỏi sâu về tiến độ và lý do chưa nộp các báo cáo này.
                </p>
              </div>
            </div>
          </div>
        )}

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
              className="block w-full pl-10 pr-3 py-2 border border-border bg-card rounded-full text-[14px] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-sm transition-shadow"
            />
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-5 py-2 bg-card border border-border rounded-full text-[13px] font-semibold text-foreground hover:bg-muted shadow-sm transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Độ khó
            </button>
            <button className="flex items-center gap-2 px-5 py-2 bg-card border border-border rounded-full text-[13px] font-semibold text-foreground hover:bg-muted shadow-sm transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              Mới nhất
            </button>
          </div>
        </div>

        {/* Questions Grid */}
        {!loading && !error && questions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {questions.map((q, idx) => {
              const isWide = idx === 0;
              const difficultyLabel = q.difficulty === "easy" ? "Dễ" : q.difficulty === "medium" ? "Trung bình" : "Khó";
              const difficultyBadgeClass = q.difficulty === "easy" ? "bg-green-500/10 text-green-500" : q.difficulty === "medium" ? "bg-blue-500/10 text-blue-500" : "bg-red-500/10 text-red-500";
              const difficultyStatusClass = q.difficulty === "easy" ? "bg-green-500/10 text-green-500" : q.difficulty === "medium" ? "bg-orange-500/10 text-orange-500" : "bg-red-500/10 text-red-500";
              return (
                <div key={q.id} className={`${isWide ? "md:col-span-2" : "md:col-span-1"} rounded-2xl border border-border bg-card shadow-sm p-6 flex flex-col justify-between`}>
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <span className={`px-3 py-1 ${difficultyBadgeClass} text-[12px] font-bold rounded-full`}>
                        {difficultyLabel}
                      </span>
                    </div>
                    <h3 className="text-[18px] font-serif font-bold text-primary mb-3 leading-snug">
                      {q.question}
                    </h3>
                    
                    <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-6">
                      <div className="flex items-center gap-2 mb-2 text-primary font-semibold text-[13px]">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        Gợi ý:
                      </div>
                      <p className="text-muted-foreground text-[13px] leading-relaxed">
                        {q.hint}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2 border-t border-border pt-4">
                    <span className={`px-3 py-1.5 text-[12px] font-semibold rounded-md flex items-center gap-1 ${difficultyStatusClass}`}>
                      {q.difficulty === "easy" ? "Đã sẵn sàng" : q.difficulty === "medium" ? "Cần xem lại" : "Cần chuẩn bị kỹ"}
                    </span>
                    <button className="text-primary font-bold text-[13px] hover:underline">
                      Xem chi tiết
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Banner */}
        <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-10 flex flex-col items-start justify-center shadow-md overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-[0.03] rounded-full -mr-10 -mt-10 pointer-events-none"></div>
          <div className="absolute bottom-0 right-40 w-40 h-40 bg-white opacity-[0.03] rounded-full -mb-10 pointer-events-none"></div>
          
          <h2 className="text-[26px] font-serif font-bold text-white mb-3 relative z-10">Bạn muốn thử luyện tập trực tiếp?</h2>
          <p className="text-blue-100/90 text-[15px] max-w-xl mb-8 relative z-10 leading-relaxed font-medium">
            Vào Mock Room để thực hành trả lời các câu hỏi này với hội đồng AI ảo. Hệ thống sẽ nhận xét, đưa ra lời khuyên và chỉnh sửa giọng điệu, phong thái của bạn.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            <button className="px-8 py-3 bg-white text-primary font-bold text-[14px] rounded-lg shadow-sm hover:bg-zinc-100 transition-colors">
              Bắt đầu luyện tập ngay
            </button>
            <button className="px-8 py-3 bg-transparent border border-white/30 text-white font-semibold text-[14px] rounded-lg hover:bg-white/10 transition-colors">
              Tải danh sách PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
