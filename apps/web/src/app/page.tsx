"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-4.5rem)] bg-background flex flex-col font-sans">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-background pt-24 pb-32">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.08),_transparent_60%)]"></div>
        <div className="container relative z-10 mx-auto px-4 lg:px-8 max-w-[1100px] text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/40 border border-teal-900/50 text-teal-400 text-sm font-semibold mb-8">
            <span className="flex h-2 w-2 rounded-full bg-teal-500"></span>
            Hệ thống chấm điểm & phản biện AI
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground mb-8 leading-[1.15]">
            Chuẩn bị bảo vệ đồ án <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-cyan-500 to-indigo-600">
              tự tin và hoàn hảo hơn
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto font-medium mb-12">
            GraduAI giúp bạn phân tích luận văn, tạo phòng bảo vệ thử nghiệm với AI và cung cấp báo cáo đánh giá chi tiết chuẩn học thuật.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/upload">
              <Button className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold text-lg px-8 py-6 rounded-xl shadow-glow hover:brightness-110 active:scale-[0.98] transition-all duration-200 w-full sm:w-auto h-auto">
                Trải nghiệm ngay
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" className="text-foreground border-border hover:border-teal-700 hover:text-teal-400 font-semibold text-lg px-8 py-6 rounded-xl transition-all duration-200 w-full sm:w-auto h-auto">
                Tìm hiểu thêm
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-background">
        <div className="container mx-auto px-4 lg:px-8 max-w-[1100px]">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">Tính năng nổi bật</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">Mọi công cụ bạn cần để đạt điểm tối đa cho buổi bảo vệ đồ án.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Feature 1 */}
            <div className="bg-surface rounded-2xl p-8 border border-border hover:border-zinc-700 transition-all duration-200 group shadow-glow">
              <div className="w-14 h-14 rounded-xl bg-teal-950/40 text-teal-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Phân Tích Chuyên Sâu</h3>
              <p className="text-muted-foreground leading-relaxed">
                Tải lên PDF/DOCX đồ án của bạn. AI sẽ tự động phân tích, trích xuất cấu trúc và đưa ra các câu hỏi dự đoán mà hội đồng có thể hỏi.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-surface rounded-2xl p-8 border border-border hover:border-zinc-700 transition-all duration-200 group shadow-glow">
              <div className="w-14 h-14 rounded-xl bg-indigo-950/40 text-indigo-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Mock Defense Room</h3>
              <p className="text-muted-foreground leading-relaxed">
                Mô phỏng buổi bảo vệ đồ án thực tế với đồng hồ bấm giờ, các vòng phản biện và giám khảo AI thông minh để luyện tập kỹ năng thuyết trình.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-surface rounded-2xl p-8 border border-border hover:border-zinc-700 transition-all duration-200 group shadow-glow">
              <div className="w-14 h-14 rounded-xl bg-cyan-950/40 text-cyan-400 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">Báo Cáo & Chấm Điểm</h3>
              <p className="text-muted-foreground leading-relaxed">
                Nhận điểm số đánh giá toàn diện, phân tích biểu đồ radar điểm mạnh/điểm yếu và xuất báo cáo PDF chuẩn mực sau mỗi buổi luyện tập.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-surface relative overflow-hidden border-t border-border">
        <div className="absolute inset-0 bg-gradient-to-r from-teal-950/30 to-indigo-950/30"></div>
        <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">Sẵn sàng bảo vệ đồ án xuất sắc?</h2>
          <p className="text-muted-foreground text-lg mb-10 opacity-90">Tham gia cùng hàng nghìn sinh viên đã sử dụng GraduAI để nâng cao chất lượng báo cáo và kỹ năng phản biện.</p>
          <Link href="/upload">
            <Button className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-bold text-lg px-10 py-6 rounded-xl shadow-glow hover:brightness-110 active:scale-[0.98] transition-all duration-200 h-auto">
              Tải tài liệu lên ngay
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
