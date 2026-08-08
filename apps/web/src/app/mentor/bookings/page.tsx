"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Booking,
  getPendingBookings,
  getMyBookings,
  confirmBooking,
  rejectBooking,
  completeBooking,
  checkMeetingAccess,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, Flag, Clock } from "lucide-react";

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function MentorBookingsPage() {
  const { hasRole } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<Booking[]>([]);
  const [all, setAll] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form xác nhận (chốt giờ)
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmTime, setConfirmTime] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([getPendingBookings(), getMyBookings()]);
      setPending(p.data);
      setAll(a.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Không thể tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasRole("mentor")) {
      router.replace("/bookings");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm(id: number) {
    if (!confirmTime) {
      setError("Vui lòng chọn thời gian chốt");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await confirmBooking(id, {
        confirmed_time: new Date(confirmTime).toISOString(),
        note: confirmNote || undefined,
      });
      setConfirmId(null);
      setConfirmTime("");
      setConfirmNote("");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Xác nhận thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(id: number) {
    if (!confirm("Từ chối yêu cầu này?")) return;
    try {
      await rejectBooking(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Từ chối thất bại");
    }
  }

  async function handleComplete(id: number) {
    try {
      await completeBooking(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Kết thúc thất bại");
    }
  }

  async function handleEnterRoom(b: Booking) {
    if (!b.meeting_id) return;
    try {
      const res = await checkMeetingAccess(b.meeting_id);
      if (res.data.open) {
        router.push(`/room?meeting=${b.meeting_id}`);
      } else {
        alert("Phòng chưa mở (mở trước 5 phút so với giờ chốt).");
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
      <h1 className="text-2xl font-bold text-zinc-100 mb-1">Quản lý lịch Mock Room</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Xác nhận và chốt thời gian với sinh viên. Phòng sẽ mở <b>5 phút trước</b> giờ chốt.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Chờ xác nhận */}
      <h2 className="text-lg font-semibold text-zinc-200 mb-3 flex items-center gap-2">
        <Clock className="w-5 h-5 text-amber-400" /> Chờ xác nhận ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-6">Không có yêu cầu nào chờ xác nhận.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {pending.map((b) => (
            <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-zinc-100">{b.title}</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Sinh viên: {b.student_name ?? b.student_id} · Đề xuất: {fmt(b.proposed_time)}
                  </div>
                  {b.note && <div className="mt-1 text-xs text-zinc-500">Ghi chú: {b.note}</div>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(b.id)}
                    className="rounded-full border-zinc-700 text-red-300"
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Từ chối
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setConfirmId(b.id);
                      // Mặc định chốt = thời gian đề xuất của SV
                      const d = new Date(b.proposed_time);
                      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                      setConfirmTime(d.toISOString().slice(0, 16));
                    }}
                    className="rounded-full"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Xác nhận
                  </Button>
                </div>
              </div>

              {confirmId === b.id && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-zinc-800 pt-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Chốt thời gian</label>
                    <input
                      type="datetime-local"
                      value={confirmTime}
                      onChange={(e) => setConfirmTime(e.target.value)}
                      className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">Ghi chú (tuỳ chọn)</label>
                    <input
                      value={confirmNote}
                      onChange={(e) => setConfirmNote(e.target.value)}
                      className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100"
                    />
                  </div>
                  <div className="md:col-span-2 flex gap-2">
                    <Button size="sm" onClick={() => handleConfirm(b.id)} disabled={busy} className="rounded-full">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      Chốt lịch
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmId(null)}
                      className="rounded-full border-zinc-700"
                    >
                      Huỷ
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tất cả booking */}
      <h2 className="text-lg font-semibold text-zinc-200 mb-3">Tất cả lịch hẹn</h2>
      {all.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có lịch hẹn nào.</p>
      ) : (
        <div className="space-y-3">
          {all.map((b) => (
            <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-100">{b.title}</div>
                <div className="mt-1 text-xs text-zinc-400">
                  SV: {b.student_name ?? b.student_id} · Trạng thái: {b.status}
                </div>
                {b.confirmed_time && (
                  <div className="text-xs text-teal-400 mt-0.5">Chốt: {fmt(b.confirmed_time)}</div>
                )}
              </div>
              <div className="flex gap-2">
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
                {b.status === "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleComplete(b.id)}
                    className="rounded-full border-zinc-700 text-zinc-300"
                  >
                    <Flag className="w-4 h-4 mr-1" /> Kết thúc
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
