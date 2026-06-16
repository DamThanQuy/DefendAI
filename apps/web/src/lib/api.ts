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

// Upload
export function uploadDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  return api.post<DocumentResponse>("/api/documents/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
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
