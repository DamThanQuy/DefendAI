"use client";

import React from "react";
import { UploadZone } from "@/components/features/assessment/UploadZone";

export default function UploadPage() {
  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-background flex flex-col items-center">
      <div className="container mx-auto px-4 lg:px-8 py-16 lg:py-24 flex flex-col items-center w-full max-w-[1100px]">
        <div className="text-center mb-16 max-w-3xl">
          <h1 className="text-[40px] font-bold tracking-tight text-teal-400 mb-5">
            Tải tài liệu - GraduAI
          </h1>
          <p className="text-[17px] text-muted-foreground leading-relaxed max-w-2xl mx-auto font-medium">
            Nâng cao chất lượng luận văn và bài nghiên cứu của bạn với trí tuệ nhân tạo chuyên sâu dành cho học thuật.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
          {/* Left Column - Upload Zone */}
          <div className="lg:col-span-2 flex w-full">
            <UploadZone />
          </div>

          {/* Right Column - Info Cards */}
          <div className="flex flex-col gap-6">
            {/* Criteria Card */}
            <div className="bg-surface rounded-2xl border border-border p-8 flex flex-col shadow-glow">
              <h3 className="text-teal-400 font-bold text-[13px] tracking-wider uppercase mb-7 font-mono">Tiêu chuẩn tệp</h3>

              <div className="space-y-7">
                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-foreground font-semibold text-[15px] mb-1">Định dạng phù hợp</h4>
                    <p className="text-[13px] text-muted-foreground leading-relaxed font-medium">Chỉ chấp nhận các tệp văn bản .pdf hoặc .docx</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-foreground font-semibold text-[15px] mb-1">Dung lượng tệp</h4>
                    <p className="text-[13px] text-muted-foreground leading-relaxed font-medium">Kích thước tệp dưới 50MB để đảm bảo tốc độ</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-foreground font-semibold text-[15px] mb-1">Bảo mật dữ liệu</h4>
                    <p className="text-[13px] text-muted-foreground leading-relaxed font-medium">Tài liệu của bạn được mã hóa và không chia sẻ</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Support Card */}
            <div className="bg-surface rounded-2xl border border-border overflow-hidden relative flex-1 min-h-[180px] flex flex-col justify-end p-6 shadow-glow">
              <div className="absolute inset-0 z-0 bg-gradient-to-br from-teal-950/40 to-indigo-950/40"></div>

              <div className="relative z-20">
                <h4 className="text-foreground font-bold mb-1.5 text-[15px]">Cần hỗ trợ?</h4>
                <p className="text-muted-foreground text-[13px] leading-relaxed font-medium pr-4">Xem hướng dẫn định dạng tài liệu chuẩn IEEE/APA</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
