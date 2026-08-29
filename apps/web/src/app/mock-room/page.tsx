"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Booking,
  getMyBookings,
  checkMeetingAccess,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  MonitorPlay,
  Clock,
  CheckCircle2,
  XCircle,
  Hourglass,
  Video,
  ArrowRight,
} from "lucide-react";

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
  return new Date(dt + "Z").toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function MockRoomLandingPage() {
  const { hasRole } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // meeting_id -> { open, reason } đã kiểm tra
  const [accessMap, setAccessMap] = useState<Record<number, { open: boolean; reason: string }>>({});

  const isStudent = hasRole("student") || (!hasRole("mentor") && !hasRole("admin"));

  async function load() {
    setLoading(true);
    try {
      const res = await getMyBookings();
      const list = res.data;
      setBookings(list);
      // Kiểm tra trạng thái mở phòng cho các booking confirmed có meeting_id
      const checks = await Promise.all(
        list
          .filter((b) => b.status === "confirmed" && b.meeting_id)
          .map(async (b) => {
            try {
              const r = await checkMeetingAccess(b.meeting_id as number);
              return [b.meeting_id as number, { open: r.data.open, reason: r.data.reason }];
            } catch {
              return [b.meeting_id as number, { open: false, reason: "error" }];
            }
          }),
      );
      const map: Record<number, { open: boolean; reason: string }> = {};
      checks.forEach(([id, v]) => (map[id as number] = v as any));
      setAccessMap(map);
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

  // Gom booking theo mentor (chỉ những booking có mentor)
  const byMentor = useMemo(() => {
    const map = new Map<number, { mentorName: string; bookings: Booking[] }>();
    for (const b of bookings) {
      if (!b.mentor_id) continue;
      const name = b.mentor_name || `Mentor #${b.mentor_id}`;
      if (!map.has(b.mentor_id)) map.set(b.mentor_id, { mentorName: name, bookings: [] });
      map.get(b.mentor_id)!.bookings.push(b);
    }
    return Array.from(map.entries()).map(([mentorId, v]) => ({ mentorId, ...v }));
  }, [bookings]);

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
            : "Lịch chưa được xác nhận, phòng chưa mở.",
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
      <div className="flex items-center gap-3 mb-1">
        <MonitorPlay className="w-7 h-7 text-teal-400" />
        <h1 className="text-2xl font-bold text-zinc-100">Mock Room</h1>
      </div>
      <p className="text-sm text-zinc-400 mb-6">
        Chọn mentor bạn đã đặt lịch để tham gia phòng bảo vệ giả định. Phòng chỉ mở khi lịch đã được mentor xác nhận.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {byMentor.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <Video className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-300 font-medium mb-1">Bạn chưa đặt lịch với mentor nào</p>
          <p className="text-sm text-zinc-500 mb-4">
            Hãy đặt lịch Mock Room với mentor để có phòng bảo vệ giả định.
          </p>
          <Button onClick={() => router.push("/bookings")} className="rounded-full">
            Đặt lịch ngay
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {byMentor.map(({ mentorId, mentorName, bookings: mb }) => (
            <div
              key={mentorId}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-purple-900/40 border border-purple-700/50 flex items-center justify-center text-purple-300 font-bold">
                  {mentorName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-100">{mentorName}</h2>
                  <p className="text-xs text-zinc-500">Mentor • {mb.length} lịch đặt</p>
                </div>
              </div>

              <div className="space-y-3">
                {mb.map((b) => {
                  const meta = STATUS_META[b.status] ?? STATUS_META.pending;
                  const Icon = meta.icon;
                  const canEnter =
                    b.status === "confirmed" &&
                    b.meeting_id != null &&
                    accessMap[b.meeting_id]?.open;
                  return (
                    <div
                      key={b.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}
                          >
                            <Icon className="w-3.5 h-3.5" /> {meta.label}
                          </span>
                          <span className="text-sm font-medium text-zinc-100">{b.title}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-4 text-xs text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Chốt: {fmt(b.confirmed_time) || fmt(b.proposed_time)}
                          </span>
                          {b.meeting_id != null && (
                            <span className="text-zinc-500">Phòng #{b.meeting_id}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        {canEnter ? (
                          <Button
                            size="sm"
                            onClick={() => handleEnterRoom(b)}
                            className="rounded-full"
                          >
                            Vào phòng <ArrowRight className="w-4 h-4 ml-1" />
                          </Button>
                        ) : b.status === "confirmed" ? (
                          <span className="text-xs text-zinc-500 px-3 py-1.5">
                            Phòng chưa mở
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isStudent && (
        <p className="mt-6 text-xs text-zinc-600">
          Ghi chú: Mentor truy cập phòng từ mục &quot;Quản lý lịch&quot; hoặc &quot;Lịch sử Mentor&quot;.
        </p>
      )}
    </div>
  );
}
