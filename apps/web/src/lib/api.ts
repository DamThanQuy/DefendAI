import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { refreshAccessToken, handleSessionExpired } from "./auth";

// Dùng relative URL (Next.js proxy) thay vì API_BASE_URL trực tiếp:
// trong docker API_BASE_URL = http://api:8000, browser không resolve được host `api` → "Failed to fetch".
export const api = axios.create({
  baseURL: "",
  timeout: 300000,
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// Request / Response interceptors — thêm auth token, xử lý lỗi tập trung
// ---------------------------------------------------------------------------

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    // Chỉ refresh khi: 401 + chưa thử refresh + không phải chính request refresh
    const isRefreshCall = original?.url?.includes("/api/auth/refresh");
    if (err.response?.status !== 401 || !original || original._retry || isRefreshCall) {
      return Promise.reject(err);
    }

    original._retry = true;
    // refreshAccessToken là single-flight trong auth.ts — mọi caller dùng chung 1 queue
    const newToken = await refreshAccessToken();

    if (!newToken) {
      handleSessionExpired();
      return Promise.reject(err);
    }

    original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
    return api(original);
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
}

// Upload
export function uploadDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  return api.post<DocumentResponse>("/api/documents/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/**
 * Upload file lớn qua chunked (S3 Multipart) — bypass giới hạn 1MB của Next.js BFF.
 * Trả về document_id khi hoàn tất.
 */
export { ChunkedUploader } from "./chunked-upload";
export type { ChunkedUploadResult, ChunkedUploadOptions } from "./chunked-upload";

export function generateQuestions(documentId: number) {
  // Thêm provider và model vào kiểu trả về ở đây:
  return api.post<{ questions: Question[]; provider?: string; model?: string }>("/api/questions/generate", {
    document_id: documentId,
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

// ---------------------------------------------------------------------------
// Bookings (đặt lịch Mock Room: student -> mentor confirm)
// ---------------------------------------------------------------------------

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "completed"
  | "cancelled";

export interface Booking {
  id: number;
  student_id: number;
  mentor_id: number;
  proposed_time: string;
  confirmed_time: string | null;
  title: string;
  note: string | null;
  status: BookingStatus;
  meeting_id: number | null;
  reject_reason?: string | null;
  created_at: string;
  updated_at: string;
  student_name?: string | null;
  mentor_name?: string | null;
  room_open?: boolean | null;
  invited_students?: { user_id: number; name: string | null }[] | null;
}

export interface MeetingAccess {
  meeting_id: number;
  open: boolean;
  reason: string;
  confirmed_time: string | null;
  seconds_until_open: number | null;
}

// Student: tạo yêu cầu đặt lịch
export function createBooking(payload: {
  mentor_id: number;
  proposed_time: string;
  title: string;
  note?: string;
}) {
  return api.post<Booking>("/api/bookings", payload);
}

// Student/Mentor: danh sách booking của mình
export function getMyBookings() {
  return api.get<Booking[]>("/api/bookings/mine");
}

// Student: huỷ booking chưa xác nhận
export function cancelBooking(bookingId: number) {
  return api.post<Booking>(`/api/bookings/${bookingId}/cancel`);
}

// Student chủ trì: mời thêm sinh viên khác vào phòng Mock Room
export function inviteStudent(
  bookingId: number,
  identifier: string,
) {
  return api.post<Booking>(`/api/bookings/${bookingId}/invite`, { identifier });
}

// Mentor: danh sách chờ xác nhận
export function getPendingBookings() {
  return api.get<Booking[]>("/api/bookings/pending");
}

// Mentor: xác nhận + chốt giờ
export function confirmBooking(
  bookingId: number,
  payload: { confirmed_time: string; note?: string },
) {
  return api.post<Booking>(`/api/bookings/${bookingId}/confirm`, payload);
}

// Mentor: từ chối
export function rejectBooking(bookingId: number) {
  return api.post<Booking>(`/api/bookings/${bookingId}/reject`);
}

// Mentor: kết thúc buổi mock
export function completeBooking(bookingId: number) {
  return api.post<Booking>(`/api/bookings/${bookingId}/complete`);
}

// Kiểm tra phòng có mở không (trước 5 phút)
export function checkMeetingAccess(meetingId: number) {
  return api.get<MeetingAccess>(`/api/meetings/${meetingId}/access`);
}

// Lịch sử tin nhắn / speech-to-text của phòng (để xem lại sau reload)
export interface MeetingMessageItem {
  id: number;
  meeting_id: number;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at: string;
}

export function getMeetingMessages(meetingId: number) {
  return api.get<MeetingMessageItem[]>(`/api/meetings/${meetingId}/messages`);
}

// Lưu tin nhắn / speech-to-text (dùng khi WS signaling chưa sẵn sàng)
export function postMeetingMessage(
  meetingId: number,
  payload: { sender_name: string; sender_role: string; content: string },
) {
  return api.post<MeetingMessageItem>(`/api/meetings/${meetingId}/messages`, payload);
}

// Danh sách mentor (cho student chọn khi đặt lịch)
export function getMentors() {
  return api.get<{ id: number; full_name: string | null; email: string }[]>(
    "/api/auth/mentors",
  );
}

// Thông tin user hiện tại (nguồn chân lý về roles — đồng bộ sau khi backend đổi role)
export interface MeResponse {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
  roles: string[];
}
export function getMe() {
  return api.get<MeResponse>("/api/auth/me");
}

// ---------------------------------------------------------------------------
// Availability (lịch rảnh của mentor)
// ---------------------------------------------------------------------------

export interface AvailabilitySlot {
  id: number;
  mentor_id: number;
  day_of_week: number;
  start_time: string; // "08:00"
  end_time: string; // "09:00"
  is_available: boolean;
  week_pattern: string;
  day_name?: string | null;
}

// Mentor: lấy lịch rảnh của mình
export function getMyAvailability() {
  return api.get<AvailabilitySlot[]>("/api/availability");
}

// Mentor: cập nhật toàn bộ lịch rảnh
export function updateMyAvailability(slots: Partial<AvailabilitySlot>[]) {
  return api.put<AvailabilitySlot[]>("/api/availability", slots);
}

// Student: xem slot rảnh của 1 mentor
export function getMentorAvailability(mentorId: number) {
  return api.get<AvailabilitySlot[]>(`/api/availability/${mentorId}`);
}

// Student: xem lịch đã đặt của 1 mentor (để lọc slot trùng giờ)
export function getMentorBookings(mentorId: number) {
  return api.get<Booking[]>(`/api/bookings/mentor/${mentorId}`);
}

// ---------------------------------------------------------------------------
// Booking: Reschedule / Reject (mentor)
// ---------------------------------------------------------------------------

// Mentor: đề xuất đổi giờ
export function rescheduleBooking(
  bookingId: number,
  payload: { proposed_time: string; note?: string },
) {
  return api.post<Booking>(`/api/bookings/${bookingId}/reschedule`, payload);
}

// Mentor: từ chối kèm lý do
export function rejectBookingWithReason(
  bookingId: number,
  reason: string,
) {
  return api.post<Booking>(`/api/bookings/${bookingId}/reject`, { reason });
}

// ---------------------------------------------------------------------------
// ZIP/BR Analysis — Step 5 (exported for AnalysisProgress, WorkspaceChat, etc.)
// ---------------------------------------------------------------------------

/** POST /api/workspaces/{workspace_id}/analysis — tạo/tái sử dụng AnalysisJob. */
export function createAnalysis(
  workspaceId: number,
  payload: { zip_document_id: number; requirement_document_ids: number[] },
) {
  return api.post<{
    analysis_job_id: number;
    worker_job_id: string;
    status: string;
    idempotent_reused: boolean;
    input_hash: string;
  }>(`/api/workspaces/${workspaceId}/analysis`, payload);
}

/** GET /api/analysis/{job_id} — lấy trạng thái + progress. */
export function getAnalysisStatus(jobId: number) {
  return api.get<{
    analysis_job_id: number;
    workspace_id: number;
    status: string;
    current_step: string | null;
    progress: number;
    error: string | null;
    framework: string | null;
    selection_mode: string | null;
    evidence_rows: number | null;
    selected_files: number | null;
    created_at: string;
    started_at: string | null;
    finished_at: string | null;
  }>(`/api/analysis/${jobId}`);
}

/** GET /api/analysis/{job_id}/matches — lấy danh sách requirement match (Step 3 M2). */
export function getAnalysisMatches(jobId: number) {
  return api.get<{
    analysis_job_id: number;
    workspace_id: number;
    status: string;
    total: number;
    matched: number;
    partial: number;
    not_found: number;
    insufficient_evidence: number;
    matches: Array<{
      id: number;
      requirement_code: string;
      requirement_title: string;
      status: string;
      confidence: number;
      evidence: Array<{
        path: string;
        symbol_name: string;
        symbol_kind?: string;
        line_start?: number;
        line_end?: number;
        snippet?: string;
      }>;
      missing_evidence: string[];
      reason: string | null;
      reason_provider: string | null;
      reason_model: string | null;
      reason_fallback: string | null;
    }>;
  }>(`/api/analysis/${jobId}/matches`);
}

/** POST /api/analysis/{job_id}/retry — chạy lại job. */
export function retryAnalysis(jobId: number) {
  return api.post<{
    analysis_job_id: number;
    worker_job_id: string;
    status: string;
  }>(`/api/analysis/${jobId}/retry`);
}

