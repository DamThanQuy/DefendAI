"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  Booking,
  getMyBookings,
  checkMeetingAccess,
} from "@/lib/api";
import {
  Video,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  CalendarClock,
} from "lucide-react";

// Map booking.status -> tab của Lịch sử Mentor
// confirmed  -> Sắp diễn ra (buổi họp đã chốt, sắp tới)
// completed  -> Đã hoàn thành
// rejected / cancelled -> Đã hủy
function bookingToTab(status: Booking["status"]): "upcoming" | "completed" | "canceled" {
  switch (status) {
    case "confirmed":
      return "upcoming";
    case "completed":
      return "completed";
    case "rejected":
    case "cancelled":
      return "canceled";
    // pending: chưa được mentor xác nhận -> nằm ở trang Quản lý lịch, không hiện ở đây
    default:
      return "upcoming";
  }
}

// Format thời gian chốt (hoặc đề xuất) thành "HH:mm, DD/MM/YYYY"
function fmtDateTime(dt: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  const date = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${time}, ${date}`;
}

export default function SessionsPage() {
  const { hasRole, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"upcoming" | "completed" | "canceled">("upcoming");

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyBookings();
      // Chỉ lấy những booking đã được xử lý (confirmed/completed/rejected/cancelled)
      // pending giữ ở trang Quản lý lịch.
      const done = res.data.filter((b) => b.status !== "pending");
      setBookings(done);
      // Khởi tạo trạng thái phòng cho các booking confirmed
      const openState: Record<number, boolean> = {};
      await Promise.all(
        done
          .filter((b) => b.status === "confirmed" && b.meeting_id)
          .map(async (b) => {
            try {
              const r = await checkMeetingAccess(b.meeting_id as number);
              openState[b.id] = r.data.open;
            } catch {
              openState[b.id] = false;
            }
          }),
      );
      setOpenMap(openState);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Không thể tải lịch sử buổi mentor");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!hasRole("mentor")) {
      router.replace("/bookings");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // Nhóm booking theo tab
  const grouped = useMemo(() => {
    const map: Record<string, Booking[]> = { upcoming: [], completed: [], canceled: [] };
    for (const b of bookings) {
      map[bookingToTab(b.status)].push(b);
    }
    // Sắp xếp: sắp diễn ra theo giờ chốt tăng dần; đã xong/đã huỷ theo updated_at giảm dần
    map.upcoming.sort((a, b) =>
      (a.confirmed_time ?? a.proposed_time).localeCompare(b.confirmed_time ?? b.proposed_time),
    );
    map.completed.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    map.canceled.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return map;
  }, [bookings]);

  const filtered = grouped[activeTab];

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

  const tabMeta: { key: "upcoming" | "completed" | "canceled"; label: string; color: string }[] = [
    { key: "upcoming", label: "Sắp diễn ra", color: "border-primary text-primary" },
    { key: "completed", label: "Đã hoàn thành", color: "border-green-500 text-green-500" },
    { key: "canceled", label: "Đã hủy", color: "border-red-500 text-red-500" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Lịch sử buổi Mentor</h1>
          <p className="text-[14px] text-muted-foreground">
            Các buổi họp đã được xác nhận từ <b>Quản lý lịch</b> sẽ xuất hiện ở đây, giúp bạn
            theo dõi buổi nào sắp tới, đã hoàn thành hoặc đã hủy.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {tabMeta.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-6 py-3 text-[14px] font-bold border-b-2 transition-colors ${
              activeTab === t.key ? t.color : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} ({grouped[t.key].length})
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center shadow-sm text-muted-foreground font-medium">
          {activeTab === "upcoming"
            ? "Chưa có buổi nào được xác nhận. Hãy vào Quản lý lịch để chốt lịch hẹn với sinh viên."
            : "Không có lịch hẹn nào trong mục này."}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((b) => {
            const studentName = b.student_name ?? `SV #${b.student_id}`;
            const initial = studentName.split(" ").pop()?.[0] ?? "?";
            const when = b.confirmed_time ?? b.proposed_time;
            const isUpcoming = b.status === "confirmed";
            const isCompleted = b.status === "completed";
            const isCanceled = b.status === "rejected" || b.status === "cancelled";
            const badgeColor = isUpcoming
              ? "bg-primary"
              : isCompleted
              ? "bg-green-500"
              : "bg-red-500";

            return (
              <div
                key={b.id}
                className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col lg:flex-row lg:items-start justify-between gap-6 hover:shadow-md transition-shadow"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${badgeColor}`}>
                      {initial}
                    </div>
                    <div>
                      <h3 className="text-[16px] font-bold text-foreground">{studentName}</h3>
                      <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {fmtDateTime(when)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h4 className="text-[14px] font-bold text-foreground mb-1">Chủ đề: {b.title}</h4>
                    {b.note && (
                      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
                        Ghi chú: {b.note}
                      </p>
                    )}
                    {isCanceled && b.status === "rejected" && (
                      <p className="text-[13px] text-red-400 leading-relaxed mb-3">
                        Lý do từ chối: {b.reject_reason ?? "—"}
                      </p>
                    )}
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border border-border rounded-md text-[12px] font-semibold text-foreground hover:bg-muted transition-colors">
                      <FileText className="w-3.5 h-3.5" /> Tài liệu đính kèm
                    </button>
                  </div>
                </div>

                {/* Action */}
                <div className="flex items-center mt-4 lg:mt-0">
                  {isUpcoming && (
                    <button
                      onClick={() => handleEnterRoom(b)}
                      disabled={!openMap[b.id]}
                      className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-primary hover:brightness-110 text-primary-foreground rounded-lg text-[14px] font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Video className="w-4 h-4" /> {openMap[b.id] ? "Tham gia phòng" : "Chưa mở"}
                    </button>
                  )}
                  {isCompleted && (
                    <div className="flex items-center gap-2 text-green-500 font-bold text-[14px] bg-green-500/10 px-4 py-2 rounded-lg">
                      <CheckCircle2 className="w-5 h-5" /> Đã hoàn thành
                    </div>
                  )}
                  {isCanceled && (
                    <div className="flex items-center gap-2 text-red-500 font-bold text-[14px] bg-red-500/10 px-4 py-2 rounded-lg">
                      <XCircle className="w-5 h-5" /> Đã hủy
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && bookings.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <CalendarClock className="w-4 h-4" />
          Dữ liệu được đồng bộ từ trang Quản lý lịch sau khi bạn xác nhận lịch hẹn.
        </div>
      )}
    </div>
  );
}
