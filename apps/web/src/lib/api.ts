import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "./constants";
import { refreshAccessToken, handleSessionExpired } from "./auth";

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
  created_at: string;
  updated_at: string;
  student_name?: string | null;
  mentor_name?: string | null;
  room_open?: boolean | null;
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

