"use client";

import React from "react";
import Link from "next/link";
import { 
  Users, 
  Clock, 
  Wallet, 
  Star,
  CheckCircle2,
  Clock3
} from "lucide-react";

export default function MentorDashboard() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Tổng quan</h1>
        <p className="text-[14px] text-muted-foreground">
          Chào mừng trở lại! Dưới đây là các chỉ số và lịch trình hôm nay của bạn.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Bookings tháng</h3>
            <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-1">42</div>
          <div className="text-[12px] text-green-500 font-medium flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            +12% so với tháng trước
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Tổng giờ Mentor</h3>
            <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-1">128h</div>
          <div className="text-[12px] text-muted-foreground font-medium">
            Trong vòng 30 ngày qua
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Thu nhập tạm tính</h3>
            <div className="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-1">12.5M</div>
          <div className="text-[12px] text-green-500 font-medium flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            +5% so với tháng trước
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider">Đánh giá TB</h3>
            <div className="w-8 h-8 rounded-full bg-yellow-500/10 text-yellow-500 flex items-center justify-center">
              <Star className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-bold text-foreground mb-1">4.9</div>
          <div className="text-[12px] text-muted-foreground font-medium">
            Dựa trên 35 lượt đánh giá
          </div>
        </div>
      </div>

      {/* Upcoming Sessions */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[18px] font-bold text-foreground">Lịch hẹn sắp diễn ra (Hôm nay)</h2>
          <Link href="/mentor/sessions" className="text-[13px] font-semibold text-primary hover:underline">
            Xem tất cả
          </Link>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {/* Session item 1 */}
          <div className="p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                NV
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-foreground mb-1">Nguyễn Văn A</h4>
                <p className="text-[13px] text-muted-foreground flex items-center gap-2">
                  <Clock3 className="w-3.5 h-3.5" /> 14:00 - 15:00
                  <span className="text-border">|</span>
                  Chủ đề: Tối ưu hoá truy vấn SQL
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold text-foreground hover:bg-muted transition-colors">
                Xem tài liệu
              </button>
              <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-semibold hover:brightness-110 transition-colors flex items-center gap-2">
                <Video className="w-4 h-4" />
                Tham gia phòng
              </button>
            </div>
          </div>

          {/* Session item 2 */}
          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary/10 text-secondary flex items-center justify-center font-bold">
                TT
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-foreground mb-1">Trần Thị B</h4>
                <p className="text-[13px] text-muted-foreground flex items-center gap-2">
                  <Clock3 className="w-3.5 h-3.5" /> 16:30 - 17:30
                  <span className="text-border">|</span>
                  Chủ đề: Review kiến trúc Microservices
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 border border-border rounded-lg text-[13px] font-semibold text-foreground hover:bg-muted transition-colors">
                Xem tài liệu
              </button>
              <button className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-[13px] font-semibold cursor-not-allowed">
                Chưa đến giờ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
