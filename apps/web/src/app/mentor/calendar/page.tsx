"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, Save, Loader2 } from "lucide-react";
import { getMyAvailability, updateMyAvailability, AvailabilitySlot } from "@/lib/api";

const DAYS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
const TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00",
  "13:00", "14:00", "15:00", "16:00", "17:00",
];

export default function CalendarPage() {
  // Map key "dayIndex-start" -> slot (chỉ lưu những slot is_available=true)
  const [slots, setSlots] = useState<Record<string, AvailabilitySlot>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const keyOf = (dayIndex: number, time: string) => `${dayIndex}-${time}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyAvailability();
      const map: Record<string, AvailabilitySlot> = {};
      for (const s of res.data) {
        if (s.is_available) {
          map[keyOf(s.day_of_week, s.start_time)] = s;
        }
      }
      setSlots(map);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Không thể tải lịch rảnh");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSlot = (dayIndex: number, time: string) => {
    const key = keyOf(dayIndex, time);
    setSaved(false);
    setSlots((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = {
          id: 0,
          mentor_id: 0,
          day_of_week: dayIndex,
          start_time: time,
          end_time: endTimeOf(time),
          is_available: true,
          week_pattern: "all",
        };
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = Object.values(slots).map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_available: true,
        week_pattern: "all",
      }));
      await updateMyAvailability(payload);
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Lưu lịch thất bại");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Quản lý lịch rảnh</h1>
          <p className="text-[14px] text-muted-foreground max-w-2xl">
            Chọn các khung giờ bạn có thể nhận lịch hẹn. Sinh viên sẽ chỉ nhìn thấy và đặt được vào những khung giờ bạn đánh dấu màu xanh.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-lg hover:brightness-110 transition-colors shadow-sm whitespace-nowrap disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Lưu lịch biểu
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          Đã lưu lịch rảnh thành công.
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Calendar Toolbar */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-4">
            <h2 className="text-[16px] font-bold text-foreground">Lịch rảnh hàng tuần</h2>
            <div className="flex gap-1">
              <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[12px] font-medium">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-primary/20 border border-primary/50"></div>
              <span className="text-muted-foreground">Có thể nhận lịch</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-muted border border-border"></div>
              <span className="text-muted-foreground">Không rảnh</span>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Days Header */}
            <div className="grid grid-cols-8 border-b border-border bg-muted/10">
              <div className="p-4 text-center font-semibold text-[13px] text-muted-foreground border-r border-border">
                Giờ \ Ngày
              </div>
              {DAYS.map((day, i) => (
                <div key={day} className={`p-4 text-center font-bold text-[14px] border-r border-border last:border-0 ${i === 0 ? "text-primary" : "text-foreground"}`}>
                  {day}
                </div>
              ))}
            </div>

            {/* Time Slots Rows */}
            {TIME_SLOTS.map((time) => (
              <div key={time} className="grid grid-cols-8 border-b border-border last:border-0">
                <div className="p-3 text-center font-semibold text-[13px] text-muted-foreground border-r border-border bg-muted/10 flex items-center justify-center">
                  {time}
                </div>
                {DAYS.map((day, dayIndex) => {
                  const key = keyOf(dayIndex, time);
                  const isAvailable = Boolean(slots[key]);

                  return (
                    <div
                      key={dayIndex}
                      className="border-r border-border last:border-0 p-2 h-16 flex items-center justify-center relative group"
                    >
                      <button
                        onClick={() => toggleSlot(dayIndex, time)}
                        className={`w-full h-full rounded-md border transition-all flex items-center justify-center text-[12px] font-semibold
                          ${isAvailable
                            ? "bg-primary/10 border-primary/30 text-primary shadow-sm hover:bg-primary/20"
                            : "bg-transparent border-dashed border-border/60 text-muted-foreground/40 hover:border-primary/50 hover:text-primary/60"
                          }
                        `}
                      >
                        {isAvailable ? "Rảnh" : "+"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mỗi slot dài 1 tiếng (start 08:00 -> end 09:00)
function endTimeOf(start: string): string {
  const [h, m] = start.split(":").map(Number);
  const endH = h + 1;
  return `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
