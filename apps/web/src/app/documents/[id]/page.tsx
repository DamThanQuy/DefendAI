"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PERSONA_LABELS } from "@/lib/constants";
import { FileTree } from "@/components/features/assessment/FileTree";
import { FilePreview } from "@/components/features/assessment/FilePreview";

interface Question {
  id: number;
  question: string;
  hint: string;
  difficulty: string;
  persona: string;
}

interface Member {
  path: string;
  size: number;
  is_dir: boolean;
}

interface AssessmentResponse {
  assessment_id: number;
  document_id: number;
  document_name: string;
  doc_type: string;
  persona: string;
  status: string;
  chunks_count: number;
  questions: Question[];
  provider: string;
  model: string;
}

const diffCfg: Record<string, { label: string; bg: string; txt: string }> = {
  easy: { label: "Dễ", bg: "bg-green-50", txt: "text-green-700" },
  medium: { label: "Trung bình", bg: "bg-blue-50", txt: "text-blue-600" },
  hard: { label: "Khó", bg: "bg-red-50", txt: "text-[#d32f2f]" },
};

export default function DocumentDetailPage() {
  const params = useParams();
  const docId = Number(params.id);
  const [data, setData] = useState<AssessmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"questions" | "file">("questions");

  useEffect(() => {
    if (!docId) return;
    const token = localStorage.getItem("access_token");
    if (!token) return;

    fetch(`/api/documents/${docId}/assessments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch assessments");
        return r.json();
      })
      .then((assessmentsData) => {
        const items = assessmentsData.items ?? [];
        if (items.length === 0) throw new Error("Tài liệu chưa có câu hỏi nào");
        const latest = items[0];
        return fetch(`/api/questions/${latest.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch assessment");
        return r.json();
      })
      .then((payload: AssessmentResponse) => {
        setData(payload);
        if (payload.doc_type === "zip") {
          fetch(`/api/documents/${docId}/contents`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => r.json())
            .then((contents) => setMembers(contents.items ?? []))
            .catch(() => {});
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [docId]);

  const qs = data?.questions ?? [];
  const filtered = qs.filter((q) => {
    const matchSearch =
      !search ||
      q.question.toLowerCase().includes(search.toLowerCase()) ||
      q.hint.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const difficulty = (d: string) => diffCfg[d] ?? diffCfg.medium;
  const personaLabel = (p: string) => PERSONA_LABELS[p] ?? p;

  const isZip = data?.doc_type === "zip";

  const openFile = (path: string) => {
    setSelectedFile(path);
    setRightTab("file");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#0f2e82] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-[14px]">Đang tải câu hỏi...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#0f2e82] mb-2">Không thể tải câu hỏi</h2>
          <p className="text-gray-500 mb-4">{error || "Dữ liệu không tồn tại."}</p>
          <Link href="/documents" className="text-[#0f2e82] font-semibold hover:underline">
            Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1400px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-gray-500 font-medium mb-4">
          <Link href="/" className="hover:text-[#0f2e82] transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <Link href="/documents" className="hover:text-[#0f2e82] transition-colors">Tài liệu</Link>
          <span className="mx-2">›</span>
          <span className="text-[#0f2e82] font-semibold truncate max-w-[200px]">{data.document_name}</span>
        </div>

        {/* Back button */}
        <Link
          href="/documents"
          className="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-[#0f2e82] shadow-sm hover:bg-gray-50 hover:shadow transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Quay lại danh sách tài liệu
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-bold text-[#0f2e82] mb-3">Câu hỏi phản biện</h1>
            <p className="text-[#5f6368] text-[14px] leading-relaxed">
              Dựa trên nội dung &quot;{data.document_name}&quot;, AI đã phân tích và tạo danh sách câu hỏi cho buổi bảo vệ của bạn.
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

        {isZip ? (
          /* ===== Option B: Split view (ZIP) ===== */
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
            {/* Left: file tree */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden lg:h-[calc(100vh-260px)] lg:sticky lg:top-4">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <span className="text-sm">🗜️</span>
                <span className="text-[13px] font-bold text-gray-800">Nội dung file</span>
              </div>
              <div className="p-2 overflow-y-auto lg:h-[calc(100%-48px)]">
                {members.length === 0 ? (
                  <p className="text-gray-400 text-[13px] p-3">Không có file nào</p>
                ) : (
                  <FileTree members={members} selected={selectedFile} onSelect={openFile} />
                )}
              </div>
            </div>

            {/* Right: tabs (questions / file preview) */}
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-1 w-fit">
                <button
                  onClick={() => setRightTab("questions")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "questions" ? "bg-[#0f2e82] text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Câu hỏi phản biện ({qs.length})
                </button>
                <button
                  onClick={() => setRightTab("file")}
                  className={`px-5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
                    rightTab === "file" ? "bg-[#0f2e82] text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Xem file {selectedFile ? `(${selectedFile.split("/").pop()})` : ""}
                </button>
              </div>

              {rightTab === "questions" && (
                <div>
                  <div className="flex flex-col sm:flex-row gap-3 mb-5">
                    <div className="relative flex-1 max-w-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        placeholder="Tìm kiếm câu hỏi + gợi ý..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-full text-[14px] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0f2e82] focus:border-[#0f2e82] bg-white shadow-sm transition-shadow"
                      />
                    </div>
                    <div className="px-4 py-2 border border-gray-200 rounded-full text-[14px] bg-white shadow-sm text-gray-600">
                      {filtered.length} / {qs.length} câu hỏi
                    </div>
                  </div>

                  {filtered.length === 0 ? (
                    <p className="text-center text-gray-500 py-12">Không tìm thấy câu hỏi phù hợp.</p>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                      {filtered.map((q) => {
                        const d = difficulty(q.difficulty);
                        return (
                          <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2.5 py-1 ${d.bg} ${d.txt} text-[11px] font-bold rounded-full`}>{d.label}</span>
                                <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-full">{personaLabel(q.persona)}</span>
                              </div>
                              <span className="text-[11px] text-gray-400 font-medium">#{q.id}</span>
                            </div>
                            <h3 className="text-[15px] font-bold text-[#0f2e82] leading-snug">{q.question}</h3>
                            <div className="bg-[#f8f9fa] rounded-xl overflow-hidden">
                              <button
                                onClick={() => toggleExpand(q.id)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                              >
                                <span className="flex items-center gap-2 text-[#0f2e82] font-semibold text-[13px]">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                  Gợi ý trả lời
                                </span>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedIds.has(q.id) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              {expandedIds.has(q.id) && (
                                <div className="px-4 pb-3">
                                  <p className="text-gray-600 text-[13px] leading-relaxed italic">{q.hint}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {rightTab === "file" && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-[calc(100vh-320px)] min-h-[400px]">
                  {!selectedFile ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                      <span className="text-4xl mb-3">👈</span>
                      <p className="text-[14px]">Chọn một file bên trái để xem nội dung</p>
                    </div>
                  ) : (
                    <FilePreview docId={docId} path={selectedFile} />
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ===== Non-ZIP: questions only (như cũ) ===== */
          <div>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1 max-w-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Tìm kiếm câu hỏi + gợi ý..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-full text-[14px] placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#0f2e82] focus:border-[#0f2e82] bg-white shadow-sm transition-shadow"
                />
              </div>
              <div className="px-4 py-2 border border-gray-200 rounded-full text-[14px] bg-white shadow-sm text-gray-600">
                {filtered.length} / {qs.length} câu hỏi
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-gray-500 py-12">Không tìm thấy câu hỏi phù hợp.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filtered.map((q) => {
                  const d = difficulty(q.difficulty);
                  return (
                    <div key={q.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 ${d.bg} ${d.txt} text-[11px] font-bold rounded-full`}>{d.label}</span>
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-[11px] font-bold rounded-full">{personaLabel(q.persona)}</span>
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium">#{q.id}</span>
                      </div>
                      <h3 className="text-[15px] font-bold text-[#0f2e82] leading-snug">{q.question}</h3>
                      <div className="bg-[#f8f9fa] rounded-xl overflow-hidden">
                        <button
                          onClick={() => toggleExpand(q.id)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                        >
                          <span className="flex items-center gap-2 text-[#0f2e82] font-semibold text-[13px]">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            Gợi ý trả lời
                          </span>
                          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedIds.has(q.id) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {expandedIds.has(q.id) && (
                          <div className="px-4 pb-3">
                            <p className="text-gray-600 text-[13px] leading-relaxed italic">{q.hint}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Bottom Banner */}
        <div className="bg-[#244bba] rounded-2xl p-10 flex flex-col items-start justify-center shadow-md overflow-hidden relative mt-10">
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