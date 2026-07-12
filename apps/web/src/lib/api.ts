import axios from "axios";
import { API_BASE_URL } from "./constants";

/** Axios instance mặc định trỏ tới backend API. */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 300000, 
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// Request / Response interceptors — thêm auth token, xử lý lỗi tập trung
// ---------------------------------------------------------------------------

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Có thể thêm toast / redirect ở đây
    return Promise.reject(err);
  },
);

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export interface DocumentResponse {
  id: number;
  filename: string;
  doc_type: string;
  status: string;
  created_at: string;
}

export interface Question {
  id: number;
  question: string;
  hint: string;
  difficulty: "easy" | "medium" | "hard";
  persona: string;
}

export interface CodeIssue {
  id: number;
  type: string;
  file: string;
  line: number;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  suggestion: string;
}

export interface CodeScanResponse {
  analysis_id: number;
  document_id: number;
  document_name: string;
  status: string;
  summary: string;
  provider?: string;
  model?: string;
  files_scanned: number;
  issues: CodeIssue[];
  pass_rate: number;
}

export interface UploadResult {
  documentId: number;
  filename: string;
}

// Upload qua Next route proxy (ẩn URL backend, tránh CORS) + báo tiến trình.
export function uploadDocumentWithProgress(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve({ documentId: data.documentId, filename: file.name });
        } else {
          reject(new Error(data.error || "Upload failed"));
        }
      } catch {
        reject(new Error("Invalid response"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.open("POST", "/api/documents/upload");
    xhr.send(form);
  });
}

export function generateQuestions(documentId: number, persona: string) {
  // Thêm provider và model vào kiểu trả về ở đây:
  return api.post<{ questions: Question[]; provider?: string; model?: string }>("/api/questions/generate", {
    document_id: documentId,
    persona,
  });
}

// Code review
export function scanCode(documentId: number) {
  return api.post<CodeScanResponse>("/api/code/scan", {
    document_id: documentId,
  });
}

// Health
export function healthCheck() {
  return api.get("/health");
}
