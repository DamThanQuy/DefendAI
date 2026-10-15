"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Booking,
  createBooking,
  getMentors,
  getMentorAvailability,
  getMentorBookings,
  getMyBookings,
  cancelBooking,
  checkMeetingAccess,
  AvailabilitySlot,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarPlus, Clock, CheckCircle2, XCircle, Hourglass, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_META: Record<
  string,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: "Chờ mentor xác nhận", color: "text-amber-400 bg-amber-400/10", icon: Hourglass },
  confirmed: { label: "Đã xác nhận", color: "text-teal-400 bg-teal-400/10", icon: CheckCircle2 },
  rejected: { label: "Bị từ chối", color: "text-red-400 bg-red-400/10", icon: XCircle },
  completed: { label: "Đã hoàn thành", color: "text-muted-foreground bg-zinc-400/10", icon: CheckCircle2 },
  cancelled: { label: "Đã huỷ", color: "text-muted-foreground bg-zinc-500/10", icon: XCircle },
};

function fmt(dt: string | null) {
  if (!dt) return "—";
  // backend returns naive UTC; treat as UTC then localize to viewer TZ
  return new Date(dt + "Z").toLocaleString("vi-VN", {
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

  // Lịch rảnh của mentor đang chọn (các slot cụ thể trong 7 ngày tới tính từ hôm nay)
  interface SuggestedSlot {
    date: Date;
    dayOfWeek: number;
    dayName: string;
    dateStr: string;
    startTime: string;
    endTime: string;
    isoString: string;
  }
  const [suggestedSlots, setSuggestedSlots] = useState<SuggestedSlot[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Sinh các slot gợi ý trong vòng 7 ngày tới (tính từ thời điểm hiện tại của user)
  function computeUpcomingSlots(
    availabilitySlots: AvailabilitySlot[],
    bookings: Booking[],
  ): SuggestedSlot[] {
    const now = new Date();
    // Tập hợp các mốc thời gian (theo YYYY-MM-DD-HH:mm) đã có booking hợp lệ
    const bookedTimestamps = new Set<string>();
    for (const b of bookings) {
      if (b.status === "rejected" || b.status === "cancelled") continue;
      const t = b.confirmed_time || b.proposed_time;
      if (!t) continue;
      // b.confirmed_time / proposed_time có thể là UTC string kết thúc bằng Z hoặc naive
      const d = new Date(t.endsWith("Z") ? t : t + "Z");
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      bookedTimestamps.add(`${yyyy}-${mm}-${dd}-${hh}:${min}`);
    }

    const availableRecurring = availabilitySlots.filter((s) => s.is_available);
    const dayNames = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const results: SuggestedSlot[] = [];

    // Duyệt qua 7 ngày tiếp theo (từ hôm nay ngày 0 đến ngày 7)
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const targetDay = new Date(now);
      targetDay.setDate(now.getDate() + dayOffset);
      const targetDow = targetDay.getDay(); // 0-6

      const matchedSlots = availableRecurring.filter((s) => s.day_of_week === targetDow);
      for (const slot of matchedSlots) {
        const [h, m] = slot.start_time.split(":").map(Number);
        const slotDateTime = new Date(targetDay);
        slotDateTime.setHours(h, m, 0, 0);

        // Bỏ qua các khung giờ đã trôi qua trong quá khứ so với thời điểm hiện tại của user
        if (slotDateTime.getTime() <= now.getTime()) {
          continue;
        }

        const yyyy = slotDateTime.getFullYear();
        const mm = String(slotDateTime.getMonth() + 1).padStart(2, "0");
        const dd = String(slotDateTime.getDate()).padStart(2, "0");
        const hh = String(slotDateTime.getHours()).padStart(2, "0");
        const min = String(slotDateTime.getMinutes()).padStart(2, "0");
        const key = `${yyyy}-${mm}-${dd}-${hh}:${min}`;

        // Kiểm tra xem slot ngày cụ thể này đã bị đặt hay chưa
        if (bookedTimestamps.has(key)) {
          continue;
        }

        const iso = new Date(slotDateTime.getTime() - slotDateTime.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);

        results.push({
          date: slotDateTime,
          dayOfWeek: slot.day_of_week,
          dayName: dayNames[slot.day_of_week] ?? `T${slot.day_of_week}`,
          dateStr: `${dd}/${mm}`,
          startTime: slot.start_time,
          endTime: slot.end_time,
          isoString: iso,
        });
      }
    }

    // Sắp xếp các slot theo trình tự thời gian tăng dần từ gần nhất tới xa nhất
    results.sort((a, b) => a.date.getTime() - b.date.getTime());
    return results;
  }

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

  async function loadAvailability(id: number) {
    setAvailLoading(true);
    setSuggestedSlots([]);
    try {
      const [availRes, bookRes] = await Promise.all([
        getMentorAvailability(id),
        getMentorBookings(id),
      ]);
      const upcoming = computeUpcomingSlots(availRes.data, bookRes.data);
      setSuggestedSlots(upcoming);
    } catch {
      setSuggestedSlots([]);
    } finally {
      setAvailLoading(false);
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
          res.data.reason === "booking_completed"
            ? "Buổi mock đã kết thúc, phòng đã bị khoá."
            : res.data.reason === "booking_pending" || res.data.reason === "booking_rejected" || res.data.reason === "booking_cancelled"
            ? "Lịch chưa được xác nhận, phòng chưa mở."
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
      <h1 className="text-2xl font-bold text-foreground mb-1">Đặt lịch Mock Room</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Sinh viên đặt lịch với mentor. Sau khi mentor xác nhận, phòng họp mở cho cả hai vào ngay lập tức và chỉ bị khoá khi mentor kết thúc buổi mock.
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
          className="rounded-xl border border-border bg-card/40 p-5 mb-8 space-y-4"
        >
          <div className="flex items-center gap-2 text-teal-400 font-semibold">
            <CalendarPlus className="w-5 h-5" /> Tạo yêu cầu mới
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Mentor</label>
              <select
                value={mentorId}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : "";
                  setMentorId(v);
                  setProposedTime("");
                  if (v) loadAvailability(v);
                }}
                className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
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
              <label className="block text-xs text-muted-foreground mb-1">Thời gian đề xuất</label>
              <input
                type="datetime-local"
                value={proposedTime}
                onChange={(e) => setProposedTime(e.target.value)}
                className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
              />
              {mentorId && (
                <div className="mt-2">
                  {availLoading ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Đang tải gợi ý thời gian...
                    </span>
                  ) : suggestedSlots.length === 0 ? (
                    <span className="text-xs text-amber-400">Mentor không còn slot trống nào trong 7 ngày tới. Bạn vẫn có thể tự chọn giờ, mentor sẽ xem xét xác nhận.</span>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(!showSuggestions)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-500/40 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 hover:text-teal-200 text-xs font-medium transition-all shadow-sm"
                      >
                        <Clock className="w-3.5 h-3.5 text-teal-400" />
                        <span>{showSuggestions ? "Ẩn gợi ý thời gian" : "Bấm để xem gợi ý thời gian"}</span>
                        <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-200">
                          {suggestedSlots.length} slot (7 ngày tới)
                        </span>
                        {showSuggestions ? (
                          <ChevronUp className="w-3.5 h-3.5 ml-0.5 text-teal-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 ml-0.5 text-teal-400" />
                        )}
                      </button>

                      {showSuggestions && (
                        <div className="p-2.5 bg-background/60 rounded-xl border border-border/80 space-y-2 animate-in fade-in-50 duration-200">
                          <span className="text-[11px] text-muted-foreground block font-medium">
                            Các slot rảnh trong 7 ngày tới tính từ hôm nay (bấm để chọn nhanh):
                          </span>
                          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                            {suggestedSlots.map((s) => {
                              const isSelected = proposedTime === s.isoString;
                              return (
                                <button
                                  key={`${s.isoString}`}
                                  type="button"
                                  onClick={() => setProposedTime(s.isoString)}
                                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm ${
                                    isSelected
                                      ? "bg-teal-500 border-teal-400 text-black font-semibold shadow-teal-500/20"
                                      : "bg-teal-500/10 border-teal-500/30 text-teal-300 hover:bg-teal-500/20 hover:border-teal-400/50"
                                  }`}
                                  title={`Chọn lúc ${s.startTime} ${s.dayName}, ngày ${s.dateStr}`}
                                >
                                  <span className="font-semibold">{s.dayName}</span>
                                  <span className="opacity-80 text-[11px] font-normal">({s.dateStr})</span>
                                  <span className={isSelected ? "font-bold text-black" : "text-teal-200 font-semibold"}>{s.startTime}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">Tiêu đề</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Mock bảo vệ đồ án Nhóm 5"
                className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-muted-foreground mb-1">Ghi chú (tuỳ chọn)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground"
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
      <h2 className="text-lg font-semibold text-foreground mb-3">Lịch sử đặt lịch</h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có yêu cầu đặt lịch nào.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const meta = STATUS_META[b.status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            return (
              <div
                key={b.id}
                className="rounded-xl border border-border bg-card/40 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" /> {meta.label}
                    </span>
                    <span className="text-sm font-medium text-foreground">{b.title}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
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
                      variant="default"
                      onClick={() => handleEnterRoom(b)}
                      className="rounded-full"
                    >
                      Vào phòng
                    </Button>
                  )}
                  {isStudent && b.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancel(b.id)}
                      className="rounded-full border-border text-foreground"
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
