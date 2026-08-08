"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Booking,
  createBooking,
  getMentors,
  getMyBookings,
  cancelBooking,
  checkMeetingAccess,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarPlus, Clock, CheckCircle2, XCircle, Hourglass } from "lucide-react";

const STATUS_META: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: "Chờ mentor xác nhận", color: "text-amber-400 bg-amber-400/10", icon: Hourglass },
  confirmed: { label: "Đã xác nhận", color: "text-teal-400 bg-teal-400/10", icon: CheckCircle2 },
  rejected: { label: "Bị từ chối", color: "text-red-400 bg-red-400/10", icon: XCircle },
  completed: { label: "Đã hoàn thành", color: "text-zinc-400 bg-zinc-400/10", icon: CheckCircle2 },
  cancelled: { label: "Đã huỷ", color: "text-zinc-500 bg-zinc-500/10", icon: XCircle },
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function BookingsPage() {
  const { user, hasRole } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mentors, setMentors] = useState<{ id: number; full_name: string | null; email: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Form đặt lịch
  const [mentorId, setMentorId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [proposedTime, setProposedTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStudent = hasRole("student") || (!hasRole("mentor") && !hasRole("admin"));

  async function load() {
    setLoading(true);
    try {
      const [b, m] = await Promise.all([getMyBookings(), getMentors()]);
      setBookings(b.data);
      setMentors(m.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!mentorId || !title || !proposedTime) {
      setError("Vui lòng chọn mentor, nhập tiêu đề và thời gian đề xuất");
      return;
    }
    setSubmitting(true);
    try {
      await createBooking({
        mentor_id: Number(mentorId),
        title,
        note: note || undefined,
        proposed_time: new Date(proposedTime).toISOString(),
      });
      setTitle("");
      setNote("");
      setProposedTime("");
      setMentorId("");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Đặt lịch thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: number) {
    if (!confirm("Huỷ yêu cầu đặt lịch này?")) return;
    try {
      await cancelBooking(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Huỷ thất bại");
    }
  }

  async function handleEnterRoom(b: Booking) {
    if (!b.meeting_id) return;
    try {
      const res = await checkMeetingAccess(b.meeting_id);
      if (res.data.open) {
        router.push(`/room?meeting=${b.meeting_id}`);
      } else {
        alert(
          res.data.reason === "too_early"
            ? "Phòng sẽ mở trước 5 phút so với giờ đã chốt. Vui lòng quay lại sau."
            : "Phòng chưa được mở.",
        );
      }
    } catch {
      alert("Không thể kiểm tra trạng thái phòng.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-zinc-100 mb-1">Đặt lịch Mock Room</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Sinh viên đặt lịch với mentor. Phòng họp sẽ tự động mở <b>5 phút trước</b> giờ đã chốt.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Form đặt lịch (chỉ student) */}
      {isStudent && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 mb-8 space-y-4"
        >
          <div className="flex items-center gap-2 text-teal-400 font-semibold">
            <CalendarPlus className="w-5 h-5" /> Tạo yêu cầu mới
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Mentor</label>
              <select
                value={mentorId}
                onChange={(e) => setMentorId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">-- Chọn mentor --</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Thời gian đề xuất</label>
              <input
                type="datetime-local"
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Tiêu đề</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Mock bảo vệ đồ án Nhóm 5"
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">Ghi chú (tuỳ chọn)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
          </div>
          <Button type="submit" disabled={submitting} className="rounded-full">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Gửi yêu cầu
          </Button>
        </form>
      )}

      {/* Danh sách booking */}
      <h2 className="text-lg font-semibold text-zinc-200 mb-3">Lịch sử đặt lịch</h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có yêu cầu đặt lịch nào.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div
                key={b.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" /> {meta.label}
                    </span>
                    <span className="text-sm font-medium text-zinc-100">{b.title}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-4 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Đề xuất: {fmt(b.proposed_time)}
                    </span>
                    {b.confirmed_time && (
                      <span className="flex items-center gap-1 text-teal-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Chốt: {fmt(b.confirmed_time)}
                      </span>
                    )}
                    <span>
                      {isStudent ? `Mentor: ${b.mentor_name ?? b.mentor_id}` : `SV: ${b.student_name ?? b.student_id}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {b.status === "confirmed" && b.meeting_id && (
                    <Button
                      size="sm"
                      variant={b.room_open ? "default" : "outline"}
                      disabled={!b.room_open}
                      onClick={() => handleEnterRoom(b)}
                      className="rounded-full"
                    >
                      {b.room_open ? "Vào phòng" : "Chưa mở"}
                    </Button>
                  )}
                  {isStudent && b.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancel(b.id)}
                      className="rounded-full border-zinc-700 text-zinc-300"
                    >
                      Huỷ
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
