"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UploadModal } from "@/components/features/assessment/UploadModal";

interface DocumentItem {
  id: number;
  filename: string;
  file_type: string;
  doc_type: string;
  status: string;
  purpose: string;
  created_at: string;
}

interface DocumentsResponse {
  total: number;
  items: DocumentItem[];
}

const docTypeLabel: Record<string, string> = {
  pdf: "PDF",
  docx: "DOCX",
  pptx: "PPTX",
  zip: "ZIP",
};

const statusLabel: Record<string, string> = {
  uploaded: "Đã tải lên",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  failed: "Thất bại",
};

const statusColor: Record<string, string> = {
  uploaded: "text-blue-600 bg-blue-50",
  processing: "text-yellow-600 bg-yellow-50",
  completed: "text-green-600 bg-green-50",
  failed: "text-red-600 bg-red-50",
};

function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch("/api/documents/", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((data: DocumentsResponse) => setDocs(data.items ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Bắt đầu phân tích 1 document (status = uploaded) → gọi generate → poll job → cập nhật status
  const handleAnalyze = async (doc: DocumentItem) => {
    if (analyzingId) return;
    setAnalyzingId(doc.id);
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: "processing" } : d)));

    const token = getToken();
    try {
      const res = await fetch("/api/questions/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ documentId: doc.id, persona: "theory" }),
      });
      const data = await res.json();

      if (!data.job_id) {
        setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: "failed" } : d)));
        setError(data.detail || data.error || "Không thể bắt đầu phân tích");
        setAnalyzingId(null);
        return;
      }

      // Poll job cho đến khi hoàn tất
      const jobId = data.job_id;
      const pollInterval = 1500;
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        const pollRes = await fetch(`/api/jobs/${jobId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const job = await pollRes.json();

        if (job.status === "completed") {
          setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: "completed" } : d)));
          setAnalyzingId(null);
          router.push(`/documents/${doc.id}`);
          return;
        }
        if (job.status === "failed") {
          setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: "failed" } : d)));
          setError(job.error || "Phân tích thất bại");
          setAnalyzingId(null);
          return;
        }
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: "failed" } : d)));
      setError("Phân tích quá lâu, vui lòng thử lại");
      setAnalyzingId(null);
    } catch (e: any) {
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: "failed" } : d)));
      setError(e.message || "Không thể kết nối máy chủ");
      setAnalyzingId(null);
    }
  };

  const token = typeof window !== "undefined" ? getToken() : null;

  if (!token) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#0f2e82] mb-2">Vui lòng đăng nhập</h2>
          <Link href="/login" className="text-[#0f2e82] font-semibold hover:underline">Đăng nhập ngay</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1100px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-gray-500 font-medium mb-6">
          <Link href="/" className="hover:text-[#0f2e82] transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <span className="text-[#0f2e82] font-semibold">Tài liệu</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-[28px] font-bold text-[#0f2e82] mb-2">Tài liệu của tôi</h1>
            <p className="text-[#5f6368] text-[14px]">Quản lý tài liệu đã tải lên và xem câu hỏi phản biện.</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="px-6 py-2.5 bg-[#0f2e82] text-white rounded-lg text-[14px] font-semibold hover:bg-[#1a3a9c] transition-colors shrink-0"
          >
            + Tải lên tài liệu mới
          </button>
        </div>

        {loading && (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-[#0f2e82] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-[14px]">Đang tải danh sách...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-[14px] mb-6">
            {error}
          </div>
        )}

        {!loading && !error && docs.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-[#0f2e82] mb-2">Chưa có tài liệu nào</h2>
            <p className="text-gray-500 text-[14px] mb-6">Tải lên tài liệu đầu tiên để AI phân tích và tạo câu hỏi.</p>
            <button onClick={() => setShowUpload(true)} className="inline-block px-6 py-2.5 bg-[#0f2e82] text-white rounded-lg text-[14px] font-semibold hover:bg-[#1a3a9c]">
              Tải lên ngay
            </button>
          </div>
        )}

        {!loading && docs.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tên file</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Loại</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ngày tải lên</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-5 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <span className="text-[14px] font-semibold text-gray-800 truncate max-w-[300px]">
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-[12px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {docTypeLabel[doc.doc_type] ?? doc.file_type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-gray-500">{formatDate(doc.created_at)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${statusColor[doc.status] ?? "text-gray-600 bg-gray-50"}`}>
                          {statusLabel[doc.status] ?? doc.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {doc.status === "uploaded" && (
                            <button
                              onClick={() => handleAnalyze(doc)}
                              disabled={analyzingId !== null}
                              className="px-3 py-1.5 text-[12px] font-semibold text-white bg-[#0f2e82] rounded-lg hover:bg-[#1a3a9c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {analyzingId === doc.id ? "Đang phân tích..." : "Phân tích"}
                            </button>
                          )}
                          {doc.status === "failed" && (
                            <button
                              onClick={() => handleAnalyze(doc)}
                              disabled={analyzingId !== null}
                              className="px-3 py-1.5 text-[12px] font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {analyzingId === doc.id ? "Đang phân tích..." : "Thử lại"}
                            </button>
                          )}
                          {(doc.status === "completed" || doc.status === "processing") && (
                            <Link
                              href={`/documents/${doc.id}`}
                              className="px-3 py-1.5 text-[12px] font-semibold text-[#0f2e82] bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              Xem câu hỏi
                            </Link>
                          )}
                          <a
                            href={`/api/documents/${doc.id}/download`}
                            className="px-3 py-1.5 text-[12px] font-semibold text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            Tải xuống
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} />
    </div>
  );
}