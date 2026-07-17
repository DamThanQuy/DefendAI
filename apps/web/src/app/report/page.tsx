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

        {/* Top Section: Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Main Overview Card (Left) */}
          <div className="lg:col-span-1 bg-card rounded-2xl border border-border shadow-sm p-8 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <h3 className="text-[14px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Nhận Xét Tổng Quan</h3>
            <h2 className="text-2xl font-serif font-bold text-primary mb-4">Đạt Chuẩn Tốt</h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
              Sinh viên thể hiện sự hiểu biết sâu sắc về đồ án, kỹ năng trình bày lưu loát và tư duy phản biện tốt. Đồ án có tính ứng dụng cao và giao diện thân thiện.
            </p>
          </div>

          {/* Detailed Breakdown (Right 2x2 Grid) */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Kiến thức */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h4 className="text-[17px] font-serif font-bold text-foreground">Nền Tảng Lý Thuyết</h4>
              </div>
              <div className="mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 border border-green-500/20">Xuất sắc</span>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Nắm rất vững các khái niệm trọng tâm về kiến trúc phần mềm, dễ dàng áp dụng lý thuyết để giải quyết vấn đề thực tế trong đồ án.
              </p>
            </div>

            {/* Trình bày */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center border border-secondary/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h4 className="text-[17px] font-serif font-bold text-foreground">Kỹ Năng Thuyết Trình</h4>
              </div>
              <div className="mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">Tốt</span>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Tự tin, diễn đạt rõ ràng, giọng nói mạch lạc. Slide được chuẩn bị chu đáo nhưng đôi chỗ còn hơi nhiều chữ.
              </p>
            </div>

            {/* Phản biện */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h4 className="text-[17px] font-serif font-bold text-foreground">Tư Duy Phản Biện</h4>
              </div>
              <div className="mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 border border-blue-500/20">Tốt</span>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Bình tĩnh xử lý các câu hỏi khó, bảo vệ quan điểm hợp lý với những luận điểm logic và chứng minh thuyết phục.
              </p>
            </div>

            {/* Đồ án */}
            <div className="bg-card shadow-sm rounded-2xl border border-border p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
                <h4 className="text-[17px] font-serif font-bold text-foreground">Chất Lượng Đồ Án</h4>
              </div>
              <div className="mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 border border-green-500/20">Xuất sắc</span>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Source code sạch sẽ, rõ ràng. Tính năng hoàn thiện đúng như cam kết trong đề tài, giao diện mượt mà và thân thiện.
              </p>
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