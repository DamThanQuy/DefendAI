"use client";

import React from "react";
import Link from "next/link";

export default function QuestionsPage() {
  return (
    <div className="min-h-screen pb-16">
      <div className="container mx-auto px-4 lg:px-8 pt-6 max-w-[1100px]">
        {/* Breadcrumb */}
        <div className="flex items-center text-[13px] text-muted-foreground font-medium mb-4">
          <Link href="/" className="hover:text-primary transition-colors">Trang chủ</Link>
          <span className="mx-2">›</span>
          <span className="text-primary font-semibold">Kết quả phân tích (AI Results)</span>
        </div>

        {/* Header Area */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div className="max-w-2xl">
            <h1 className="text-[28px] font-serif font-bold text-primary mb-3">Kết quả phân tích (AI Results)</h1>
            <p className="text-muted-foreground text-[14px] leading-relaxed">
              Dựa trên nội dung đồ án của bạn, AI đã phân tích và dự đoán danh sách các câu hỏi mà hội đồng phản biện có khả năng cao sẽ đặt ra. Hãy chuẩn bị kỹ lưỡng để đạt kết quả tốt nhất.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5 flex items-center gap-4 min-w-[280px]">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Trạng thái tổng quan</div>
              <div className="text-[18px] font-bold text-green-500">Đã chuẩn bị tốt</div>
            </div>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input 
              type="text" 
              placeholder="Tìm kiếm câu hỏi..." 
              className="block w-full pl-10 pr-3 py-2 border border-border bg-card rounded-full text-[14px] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-sm transition-shadow"
            />
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-5 py-2 bg-card border border-border rounded-full text-[13px] font-semibold text-foreground hover:bg-muted shadow-sm transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Độ khó
            </button>
            <button className="flex items-center gap-2 px-5 py-2 bg-card border border-border rounded-full text-[13px] font-semibold text-foreground hover:bg-muted shadow-sm transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              Mới nhất
            </button>
          </div>
        </div>

        {/* Cards Grid Top (1 Wide, 1 Narrow) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          
          {/* Card 1 (Wide) */}
          <div className="md:col-span-2 rounded-2xl border border-border bg-card shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <span className="px-3 py-1 bg-red-500/10 text-red-500 text-[12px] font-bold rounded-full">Cốt lõi / Khó</span>
                <span className="text-muted-foreground text-[12px] font-semibold flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                  Độ ưu tiên cao
                </span>
              </div>
              <h3 className="text-[18px] font-serif font-bold text-primary mb-3 leading-snug">
                Làm thế nào để hệ thống đảm bảo tính bảo mật và quyền riêng tư của dữ liệu người dùng khi tích hợp AI thể hệ thứ ba?
              </h3>
              <p className="text-foreground text-[14px] mb-6">
                Hội đồng thường xoáy sâu vào khâu lưu trữ và truyền tải dữ liệu nhạy cảm của sinh viên. Đây là điểm yếu phổ biến trong các đồ án EdTech.
              </p>
              
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-2 text-primary font-semibold text-[13px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Gợi ý từ AI:
                </div>
                <p className="text-muted-foreground text-[14px] italic leading-relaxed">
                  "Tập trung vào giải pháp mã hóa AES-256 cho dữ liệu tĩnh và TLS 1.3 cho dữ liệu đang truyền tải. Nhấn mạnh việc loại bỏ PII (Thông tin định danh cá nhân) trước khi đưa vào mô hình AI."
                </p>
              </div>
            </div>
            <div className="flex justify-between items-center mt-2 border-t border-border pt-4">
              <span className="px-3 py-1.5 bg-green-500/10 text-green-500 text-[12px] font-semibold rounded-md flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Đã sẵn sàng
              </span>
              <button className="text-primary font-bold text-[13px] flex items-center gap-1 hover:underline">
                Xem chi tiết <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </div>

          {/* Card 2 (Narrow) */}
          <div className="md:col-span-1 rounded-2xl border border-border bg-card shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="mb-4">
                <span className="px-3 py-1 bg-blue-500/10 text-blue-500 text-[12px] font-bold rounded-full">Kiến trúc / Trung bình</span>
              </div>
              <h3 className="text-[16px] font-serif font-bold text-primary mb-5 leading-snug">
                Tại sao bạn chọn kiến trúc Microservices thay vì Monolith cho dự án này?
              </h3>
              
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-6 flex-1">
                <div className="flex items-center gap-2 mb-2 text-primary font-semibold text-[13px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Gợi ý:
                </div>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  Giải thích dựa trên khả năng mở rộng (scalability) và khả năng triển khai độc lập các module AI tiêu tốn nhiều tài nguyên.
                </p>
              </div>
            </div>
            <div className="flex justify-between items-center mt-2 border-t border-border pt-4">
              <span className="px-3 py-1.5 bg-orange-500/10 text-orange-500 text-[12px] font-semibold rounded-md">
                Cần xem lại
              </span>
              <button className="text-primary font-bold text-[13px] hover:underline">
                Xem chi tiết
              </button>
            </div>
          </div>
        </div>

        {/* Cards Grid Bottom (3 Narrow) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          
          {/* Card 3 */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="mb-4">
                <span className="px-3 py-1 bg-green-500/10 text-green-500 text-[12px] font-bold rounded-full">Hiệu năng / Dễ</span>
              </div>
              <h3 className="text-[16px] font-serif font-bold text-primary mb-5 leading-snug">
                Làm thế nào để tối ưu hóa thời gian phản hồi của chatbot AI khi có nhiều người dùng cùng lúc?
              </h3>
              
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2 text-primary font-semibold text-[13px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Gợi ý:
                </div>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  Sử dụng Redis cho caching, triển khai Queue (RabbitMQ/Kafka) để xử lý các yêu cầu không đồng bộ.
                </p>
              </div>
            </div>
            <button className="w-full border border-border bg-card text-primary font-semibold text-[13px] py-2.5 rounded-full hover:bg-muted transition-colors mt-auto">
              Xem chi tiết
            </button>
          </div>

          {/* Card 4 */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="mb-4">
                <span className="px-3 py-1 bg-purple-500/10 text-purple-500 text-[12px] font-bold rounded-full">Đánh giá / Trung bình</span>
              </div>
              <h3 className="text-[16px] font-serif font-bold text-primary mb-5 leading-snug">
                Bạn đã đánh giá độ chính xác của các đề xuất AI bằng phương pháp nào?
              </h3>
              
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2 text-primary font-semibold text-[13px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Gợi ý:
                </div>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  Trình bày về độ đo F1-Score và quá trình User Acceptance Testing (UAT) với nhóm đối tượng sinh viên thử nghiệm.
                </p>
              </div>
            </div>
            <button className="w-full border border-border bg-card text-primary font-semibold text-[13px] py-2.5 rounded-full hover:bg-muted transition-colors mt-auto">
              Xem chi tiết
            </button>
          </div>

          {/* Card 5 */}
          <div className="rounded-2xl border border-border bg-card shadow-sm p-6 flex flex-col justify-between">
            <div>
              <div className="mb-4">
                <span className="px-3 py-1 bg-blue-500/10 text-blue-500 text-[12px] font-bold rounded-full">Phát triển / Dễ</span>
              </div>
              <h3 className="text-[16px] font-serif font-bold text-primary mb-5 leading-snug">
                Kế hoạch mở rộng hệ thống để hỗ trợ các ngôn ngữ lập trình khác trong tương lai?
              </h3>
              
              <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2 text-primary font-semibold text-[13px]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                  Gợi ý:
                </div>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  Sử dụng tính trừu tượng trong mã nguồn để dễ dàng tích hợp các bộ parser mới mà không thay đổi logic lõi.
                </p>
              </div>
            </div>
            <button className="w-full border border-border bg-card text-primary font-semibold text-[13px] py-2.5 rounded-full hover:bg-muted transition-colors mt-auto">
              Xem chi tiết
            </button>
          </div>

        </div>

        {/* Bottom Banner */}
        <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-10 flex flex-col items-start justify-center shadow-md overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-[0.03] rounded-full -mr-10 -mt-10 pointer-events-none"></div>
          <div className="absolute bottom-0 right-40 w-40 h-40 bg-white opacity-[0.03] rounded-full -mb-10 pointer-events-none"></div>
          
          <h2 className="text-[26px] font-serif font-bold text-white mb-3 relative z-10">Bạn muốn thử luyện tập trực tiếp?</h2>
          <p className="text-blue-100/90 text-[15px] max-w-xl mb-8 relative z-10 leading-relaxed font-medium">
            Vào Mock Room để thực hành trả lời các câu hỏi này với hội đồng AI ảo. Hệ thống sẽ nhận xét, đưa ra lời khuyên và chỉnh sửa giọng điệu, phong thái của bạn.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 relative z-10">
            <button className="px-8 py-3 bg-white text-primary font-bold text-[14px] rounded-lg shadow-sm hover:bg-zinc-100 transition-colors">
              Bắt đầu luyện tập ngay
            </button>
            <button className="px-8 py-3 bg-transparent border border-white/30 text-white font-semibold text-[14px] rounded-lg hover:bg-white/10 transition-colors">
              Tải danh sách PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
