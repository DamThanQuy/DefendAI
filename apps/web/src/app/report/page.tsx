import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

"use client";

import React from "react";
import Link from "next/link";


export default function ReportPage() {
  return (
    <div className="min-h-screen pb-24">
      <div className="container mx-auto px-4 lg:px-8 pt-8 max-w-[1100px]">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
          <div>
            <h1 className="text-[32px] font-serif font-bold text-primary mb-2 tracking-tight">Báo cáo Đánh giá</h1>
            <p className="text-muted-foreground text-[15px] font-medium">
              Chi tiết kết quả bảo vệ đồ án tốt nghiệp - Sinh viên: Nguyễn Văn A
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-[14px] font-medium bg-card px-4 py-2 rounded-lg shadow-sm border border-border">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Ngày đánh giá: 24/10/2024
          </div>
        </div>

        {/* Top Section: Score Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Main Score Card (Left) */}
          <div className="lg:col-span-1 bg-card rounded-2xl border border-border shadow-sm p-8 flex flex-col items-center justify-center">
            <h3 className="text-[13px] font-bold text-muted-foreground uppercase tracking-widest mb-6">Điểm Tổng Kết</h3>
            
            {/* Circular Progress */}
            <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-primary"
                  strokeWidth="3.5"
                  strokeDasharray="85, 100"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center mt-1">
                <span className="text-[40px] font-bold text-primary leading-none mb-1">8.5</span>
                <span className="text-[15px] text-muted-foreground font-semibold">/ 10</span>
              </div>
            </div>
            
            <div className="px-5 py-2 bg-primary/10 text-primary text-[14px] font-semibold rounded-full border border-primary/20">
              Xếp loại: Giỏi
            </div>
          </div>

          {/* Sub Scores (Right 2x2 Grid) */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Kiến thức */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <span className="text-[28px] font-bold text-primary">9.0</span>
              </div>
              <div>
                <h4 className="text-[18px] font-serif font-bold text-foreground mb-1">Kiến thức</h4>
                <p className="text-[12px] text-muted-foreground font-medium">Khả năng nắm vững lý thuyết và áp dụng vào thực tế đồ án.</p>
              </div>
            </div>

            {/* Trình bày */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-[28px] font-bold text-secondary">8.0</span>
              </div>
              <div>
                <h4 className="text-[18px] font-serif font-bold text-foreground mb-1">Trình bày</h4>
                <p className="text-[12px] text-muted-foreground font-medium">Khả năng diễn đạt, sử dụng slide và phong thái tự tin.</p>
              </div>
            </div>

            {/* Phản biện */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <span className="text-[28px] font-bold text-orange-400">8.2</span>
              </div>
              <div>
                <h4 className="text-[18px] font-serif font-bold text-foreground mb-1">Phản biện</h4>
                <p className="text-[12px] text-muted-foreground font-medium">Xử lý câu hỏi khó và bảo vệ quan điểm logic.</p>
              </div>
            </div>

            {/* Đồ án */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <span className="text-[28px] font-bold text-red-400">8.8</span>
              </div>
              <div>
                <h4 className="text-[18px] font-serif font-bold text-foreground mb-1">Đồ án</h4>
                <p className="text-[12px] text-muted-foreground font-medium">Tính hoàn thiện, cấu trúc code và giải pháp kỹ thuật.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Section: Strengths and Weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          
          {/* Điểm mạnh */}
          <div className="bg-primary/5 rounded-2xl border border-primary/20 overflow-hidden flex flex-col h-full">
            <div className="px-6 py-5 border-b border-primary/20 flex items-center gap-3">
              <div className="text-primary">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-[18px] font-serif font-bold text-primary">Điểm mạnh</h3>
            </div>
            <div className="p-6 flex-1 flex flex-col gap-5">
              <div className="flex gap-4 items-start">
                <svg className="w-5 h-5 text-primary mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <p className="text-[14px] text-muted-foreground leading-relaxed font-medium">
                  Nắm rất vững kiến thức nền tảng về cấu trúc dữ liệu và giải thuật áp dụng trong AI.
                </p>
              </div>
              <div className="flex gap-4 items-start">
                <svg className="w-5 h-5 text-primary mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <p className="text-[14px] text-muted-foreground leading-relaxed font-medium">
                  Phong thái trình bày chuyên nghiệp, tự tin, trả lời trôi chảy các câu hỏi liên quan đến code.
                </p>
              </div>
              <div className="flex gap-4 items-start">
                <svg className="w-5 h-5 text-primary mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <p className="text-[14px] text-muted-foreground leading-relaxed font-medium">
                  Đồ án có tính ứng dụng thực tiễn cao, giao diện người dùng mượt mà và trực quan.
                </p>
              </div>
            </div>
          </div>

          {/* Cần cải thiện */}
          <div className="bg-red-500/5 rounded-2xl border border-red-500/20 overflow-hidden flex flex-col h-full">
            <div className="px-6 py-5 border-b border-red-500/20 flex items-center gap-3">
              <div className="text-red-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-[18px] font-serif font-bold text-red-400">Cần cải thiện</h3>
            </div>
            <div className="p-6 flex-1 flex flex-col gap-5">
              <div className="flex gap-4 items-start">
                <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <p className="text-[14px] text-muted-foreground leading-relaxed font-medium">
                  Cần tối ưu hóa hiệu suất cho các tập dữ liệu lớn hơn trong phần xử lý ngôn ngữ tự nhiên.
                </p>
              </div>
              <div className="flex gap-4 items-start">
                <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <p className="text-[14px] text-muted-foreground leading-relaxed font-medium">
                  Slide trình bày phần kỹ thuật chuyên sâu nên có thêm biểu đồ minh họa chi tiết hơn.
                </p>
              </div>
              <div className="flex gap-4 items-start">
                <svg className="w-5 h-5 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <p className="text-[14px] text-muted-foreground leading-relaxed font-medium">
                  Báo cáo tài liệu (documentation) phần API cần bổ sung các trường hợp lỗi biên.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Action Button */}
        <div className="flex justify-center">
          <button className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary to-secondary hover:brightness-110 text-white font-bold text-[16px] rounded-xl shadow-md transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Tải xuống báo cáo PDF
          </button>
        </div>

      </div>
    </div>
  );
}