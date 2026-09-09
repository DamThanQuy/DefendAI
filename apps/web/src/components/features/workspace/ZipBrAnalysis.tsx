"use client";

import { useState } from "react";
import { AnalysisProgress } from "./AnalysisProgress";
import { AnalysisSummary } from "./AnalysisSummary";
import { MatchList } from "./MatchList";
import { createAnalysis, retryAnalysis } from "@/lib/api";
import type { AnalysisStatusOut, RequirementMatchesResponse } from "@/types";

export interface ZipBrDocument {
  id: number;
  filename: string;
  doc_type: string;
  status: string;
}

/**
 * ZIP/BR Analysis sub-section — host trong panel "Luyện phản biện" của workspace.
 * Tách ra từ WorkspaceChat để gộp logic mock-defense + ZIP/BR evidence matching
 * vào cùng 1 tab (R6/R7).
 *
 * Props:
 * - workspaceId: cần thiết cho POST /api/workspaces/{id}/analysis
 * - documents: tất cả file đã xử lý xong của workspace; component tự lọc
 *              zip + requirement (pdf/docx/pptx/md) từ danh sách này.
 */
export default function ZipBrAnalysis({
  workspaceId,
  documents = [],
  onFocusWeakSpots,
}: {
  workspaceId: number;
  documents?: ZipBrDocument[];
  /** Optional callback invoked khi user bấm "Sinh câu hỏi tập trung điểm yếu".
   *  Nhận topic string (UC codes + missing evidence) để FE dùng cho `/api/workspaces/{id}/questions`. */
  onFocusWeakSpots?: (topic: string) => void;
}) {
  const [analysisView, setAnalysisView] = useState<"running" | "results" | null>(null);
  const [analysisJobId, setAnalysisJobId] = useState<number | null>(null);
  const [analysisMatches, setAnalysisMatches] = useState<RequirementMatchesResponse | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatusOut | null>(null);

  const startAnalysis = async (zipDocumentId: number, requirementDocumentIds: number[]) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const { data } = await createAnalysis(workspaceId, {
        zip_document_id: zipDocumentId,
        requirement_document_ids: requirementDocumentIds,
      });
      setAnalysisJobId(data.analysis_job_id);
      setAnalysisView("running");
    } catch (e: any) {
      setAnalysisError(e?.response?.data?.detail ?? e?.message ?? "Không thể bắt đầu phân tích");
      setAnalysisView("results");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleAnalysisComplete = (
    matches: RequirementMatchesResponse,
    status: AnalysisStatusOut,
  ) => {
    setAnalysisMatches(matches);
    setAnalysisStatus(status);
    setAnalysisView("results");
  };

  const handleAnalysisError = (error: string) => {
    setAnalysisError(error);
    setAnalysisView("results");
  };

  const retryAnalysisHandler = async () => {
    if (!analysisJobId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      await retryAnalysis(analysisJobId);
      setAnalysisMatches(null);
      setAnalysisView("running");
    } catch (e: any) {
      setAnalysisError(e?.response?.data?.detail ?? e?.message ?? "Retry thất bại");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const closeAnalysis = () => {
    setAnalysisView(null);
    setAnalysisJobId(null);
    setAnalysisMatches(null);
    setAnalysisStatus(null);
    setAnalysisError(null);
  };

  // Tổng quan file đủ điều kiện
  const zip = documents.find((d) => d.doc_type === "zip" && d.status === "completed");
  const reqs = documents.filter(
    (d) => ["pdf", "docx", "pptx", "md"].includes(d.doc_type) && d.status === "completed",
  );
  const disabled = !zip || reqs.length === 0;

  // Build topic string từ các match partial/not_found để làm input cho /workspaces/{id}/questions
  // → RAG retrieval sẽ bias theo UC codes + evidence còn thiếu, giúp LLM sinh câu hỏi
  // tập trung vào điểm yếu hội đồng có thể hỏi.
  const weakSpots = analysisMatches?.matches?.filter(
    (m) => m.status === "partial" || m.status === "not_found",
  ) ?? [];
  const weakSpotsCount = weakSpots.length;
  const buildWeakSpotsTopic = (): string => {
    if (!weakSpots.length) return "";
    const lines: string[] = [
      "Tập trung đối chiếu các yêu cầu BR sau (đang thiếu hoặc chỉ khớp một phần bằng chứng triển khai):",
    ];
    for (const m of weakSpots.slice(0, 12)) {
      const code = m.requirement_code;
      const title = m.requirement_title ? ` — ${m.requirement_title}` : "";
      const miss = m.missing_evidence?.length
        ? ` (thiếu: ${m.missing_evidence.join("; ")})`
        : "";
      lines.push(`- ${code}${title}${miss}`);
    }
    if (weakSpots.length > 12) {
      lines.push(`… và ${weakSpots.length - 12} yêu cầu yếu khác.`);
    }
    lines.push(
      "Sinh câu hỏi phản biện mà hội đồng có thể đặt ra cho các điểm yếu này.",
    );
    return lines.join("\n");
  };

  // --- Picker card (closed state) ---
  if (!analysisView) {
    return (
      <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 p-5">
        <h3 className="text-[15px] font-bold text-zinc-200 mb-1">Phân tích BR với Source Code</h3>
        <p className="text-[12px] text-zinc-500 mb-4">
          Hệ thống tự động đối chiếu <b>bằng chứng triển khai</b> trong source code (zip) với các
          yêu cầu trong bản BR (.md/.pdf/.docx/.pptx), giúp bạn chuẩn bị phản biện trước hội đồng.
        </p>
        <button
          onClick={() => zip && startAnalysis(zip.id, reqs.map((d) => d.id))}
          disabled={disabled || analysisLoading}
          className="px-5 py-2.5 bg-teal-500 text-white rounded-xl text-[14px] font-semibold hover:bg-teal-500/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {analysisLoading ? "Đang khởi tạo…" : "🔍 Phân tích BR với Source Code"}
        </button>
        {disabled && (
          <p className="mt-2 text-[12px] text-zinc-500">
            Cần tối thiểu 1 file ZIP (source code) và 1 file BR (pdf/docx/pptx/md) đã xử lý xong.
          </p>
        )}
      </div>
    );
  }

  // Report view (running / results / error)
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-zinc-800/60 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-800/40 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={closeAnalysis}
            className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-1 rounded-md hover:bg-zinc-700 transition-colors"
          >
            ← Quay lại
          </button>
          <span className="text-[13px] font-bold text-zinc-200">Đối chiếu BR với Source Code</span>
        </div>
        {analysisJobId && (
          <span className="text-[11px] text-zinc-500">Job #{analysisJobId}</span>
        )}
      </div>

      {/* Progress view */}
      {analysisView === "running" && analysisJobId && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className="w-full max-w-lg">
            <AnalysisProgress
              jobId={analysisJobId}
              onComplete={handleAnalysisComplete}
              onError={handleAnalysisError}
            />
          </div>
        </div>
      )}

      {/* Results view */}
      {analysisView === "results" && analysisMatches && (
        <div className="p-5 flex flex-col gap-5">
          <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
            <span className="text-amber-400 shrink-0 mt-0.5">⚠️</span>
            <p className="text-xs text-amber-400 leading-relaxed">
              Đây là phân tích <strong>bằng chứng triển khai</strong>, không phải
              kiểm thử runtime hay đánh giá của hội đồng.
              Kết quả chỉ mang tính tham khảo.
            </p>
          </div>

          {analysisStatus?.evidence_rows_total != null &&
            analysisStatus.evidence_rows != null &&
            analysisStatus.evidence_rows < analysisStatus.evidence_rows_total && (
              <div className="flex items-start gap-2.5 px-4 py-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
                <span className="text-zinc-400 shrink-0 mt-0.5">ℹ️</span>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Source code có <strong>{analysisStatus.evidence_rows_total.toLocaleString("vi-VN")}</strong> đoạn
                  mã tiềm năng nhưng hệ thống chỉ giữ{" "}
                  <strong>{analysisStatus.evidence_rows.toLocaleString("vi-VN")}</strong> đoạn ưu tiên
                  (route/class/function) để giữ thời gian phân tích hợp lý. Kết quả vẫn đủ tin cậy
                  cho các yêu cầu chính.
                </p>
              </div>
            )}

          <AnalysisSummary matches={analysisMatches} />

          {onFocusWeakSpots && weakSpotsCount > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-zinc-200">
                  🎯 Có {weakSpotsCount} yêu cầu đang yếu
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                  Sinh câu hỏi phản biện tập trung vào các điểm thiếu bằng chứng.
                </p>
              </div>
              <button
                onClick={() => onFocusWeakSpots(buildWeakSpotsTopic())}
                className="shrink-0 px-3.5 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-semibold hover:bg-primary/90"
              >
                Sinh câu hỏi từ điểm yếu
              </button>
            </div>
          )}

          <MatchList matches={analysisMatches.matches} />
        </div>
      )}

      {/* Error / retry view */}
      {analysisView === "results" && analysisError && !analysisMatches && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
          <div className="flex items-start gap-2.5 px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl max-w-md">
            <span className="text-red-400 shrink-0 mt-0.5">⚠️</span>
            <p className="text-xs text-red-400 leading-relaxed">
              Phân tích thất bại: {analysisError}
            </p>
          </div>
          <div className="flex gap-3">
            {analysisJobId && (
              <button
                onClick={retryAnalysisHandler}
                disabled={analysisLoading}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {analysisLoading ? "Đang thử lại..." : "Thử lại"}
              </button>
            )}
            <button
              onClick={closeAnalysis}
              className="px-5 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
