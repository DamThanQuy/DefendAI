"use client";

import React from "react";
import { User, Mail, Link as LinkIcon, DollarSign, Save, Award } from "lucide-react";

export default function ProfilePage() {
  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground mb-2">Hồ sơ cá nhân</h1>
          <p className="text-[14px] text-muted-foreground">
            Quản lý thông tin hiển thị công khai với học viên và cài đặt mức phí dịch vụ.
          </p>
        </div>
        <button className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:brightness-110 text-primary-foreground rounded-lg text-[14px] font-bold transition-all shadow-sm">
          <Save className="w-4 h-4" /> Lưu thay đổi
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Avatar & Basic Info */}
        <div className="md:col-span-1">
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-3xl mb-4 shadow-inner">
              DR
            </div>
            <h2 className="text-[18px] font-bold text-foreground">Tiến sĩ A</h2>
            <p className="text-[13px] text-muted-foreground mb-4">Mentor Cao Cấp</p>
            <button className="text-[13px] font-semibold text-primary border border-primary/20 bg-primary/5 px-4 py-1.5 rounded-full hover:bg-primary/10 transition-colors">
              Thay đổi ảnh
            </button>
          </div>
        </div>

        {/* Right Column: Details Form */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Section 1: Thông tin cơ bản */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Thông tin cơ bản
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-bold text-muted-foreground mb-1.5">Họ và tên</label>
                  <input type="text" defaultValue="Tiến sĩ A" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="block text-[13px] font-bold text-muted-foreground mb-1.5">Chức danh</label>
                  <input type="text" defaultValue="Mentor Cao Cấp" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary transition-colors" />
                </div>
              </div>
              
              <div>
                <label className="block text-[13px] font-bold text-muted-foreground mb-1.5">Tiểu sử (Bio)</label>
                <textarea rows={4} defaultValue="Tôi là chuyên gia với 10 năm kinh nghiệm trong lĩnh vực trí tuệ nhân tạo và kiến trúc phần mềm. Rất vui được đồng hành cùng các bạn sinh viên." className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary transition-colors resize-none"></textarea>
              </div>

              <div>
                <label className="block text-[13px] font-bold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" /> Liên kết LinkedIn
                </label>
                <input type="text" defaultValue="https://linkedin.com/in/tiensia" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary transition-colors" />
              </div>
            </div>
          </div>

          {/* Section 2: Chuyên môn & Kỹ năng */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-accent" /> Chuyên môn & Kỹ năng
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-bold text-muted-foreground mb-2">Kỹ năng (Thêm tag phân cách bởi dấu phẩy)</label>
                <input type="text" defaultValue="System Design, Microservices, Machine Learning, ReactJS" className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary transition-colors mb-2" />
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 bg-muted rounded-md text-[12px] font-semibold text-foreground flex items-center gap-1">System Design <XCircleIcon className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-red-500" /></span>
                  <span className="px-2.5 py-1 bg-muted rounded-md text-[12px] font-semibold text-foreground flex items-center gap-1">Microservices <XCircleIcon className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-red-500" /></span>
                  <span className="px-2.5 py-1 bg-muted rounded-md text-[12px] font-semibold text-foreground flex items-center gap-1">Machine Learning <XCircleIcon className="w-3 h-3 text-muted-foreground cursor-pointer hover:text-red-500" /></span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Cài đặt dịch vụ */}
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <h3 className="text-[16px] font-bold text-foreground mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" /> Cài đặt dịch vụ
            </h3>
            <div>
              <label className="block text-[13px] font-bold text-muted-foreground mb-1.5">Mức phí mỗi buổi (VND/giờ)</label>
              <div className="relative max-w-xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                  ₫
                </div>
                <input type="number" defaultValue="500000" className="w-full bg-muted/30 border border-border rounded-lg pl-8 pr-3 py-2 text-[14px] text-foreground focus:outline-none focus:border-primary transition-colors font-semibold" />
              </div>
              <p className="text-[12px] text-muted-foreground mt-2">Học viên sẽ thanh toán số tiền này trước khi gửi yêu cầu đặt lịch.</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Inline component helper
function XCircleIcon(props: any) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
