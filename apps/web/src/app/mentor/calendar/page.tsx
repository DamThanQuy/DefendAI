"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";

export default function CalendarPage() {
  // Fake state cho các khung giờ rảnh (true = rảnh, false = bận)
  const [schedule, setSchedule] = useState<{ [key: string]: boolean }>({
    "T2-08:00": true,
    "T2-09:00": true,
    "T4-14:00": true,
    "T4-15:00": true,
    "T6-09:00": true,
  });

  const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", 
    "13:00", "14:00", "15:00", "16:00"
  ];

  const toggleSlot = (dayIndex: number, time: string) => {
    const key = `T${dayIndex + 2}-${time}`;
    setSchedule((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
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
        <button className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold text-[14px] rounded-lg hover:brightness-110 transition-colors shadow-sm whitespace-nowrap">
          <Save className="w-4 h-4" />
          Lưu lịch biểu
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Calendar Toolbar */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-4">
            <h2 className="text-[16px] font-bold text-foreground">Tuần này (24/10 - 30/10)</h2>
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
              {days.map((day, i) => (
                <div key={day} className={`p-4 text-center font-bold text-[14px] border-r border-border last:border-0 ${i === 0 ? "text-primary" : "text-foreground"}`}>
                  {day}
                  <div className="text-[12px] font-medium text-muted-foreground mt-0.5 font-sans">
                    {24 + i}/10
                  </div>
                </div>
              ))}
            </div>

            {/* Time Slots Rows */}
            {timeSlots.map((time) => (
              <div key={time} className="grid grid-cols-8 border-b border-border last:border-0">
                <div className="p-3 text-center font-semibold text-[13px] text-muted-foreground border-r border-border bg-muted/10 flex items-center justify-center">
                  {time}
                </div>
                {days.map((day, dayIndex) => {
                  const key = `T${dayIndex + 2}-${time}`;
                  const isAvailable = schedule[key] || false;

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
