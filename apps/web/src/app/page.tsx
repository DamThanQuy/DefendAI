"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { UploadZone } from "@/components/features/assessment/UploadZone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadDocument } from "@/lib/api";
import { PERSONAS } from "@/lib/constants";

export default function HomePage() {
  const router = useRouter();
  const [persona, setPersona] = useState("ly_thuyet");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const response = await uploadDocument(file);
      router.push(`/questions?documentId=${response.data.id}&persona=${persona}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload thất bại";
      setError(message);
      setIsUploading(false);
    }
  };

  return (
 feature/AI-integration
    <div className="container mx-auto flex min-h-[80vh] flex-col items-center justify-center px-4 py-12">
      <div className="mb-12 max-w-2xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
          MVP: Upload, AI hỏi đáp, Mock Defense
        </p>
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
          Bảo vệ đồ án thông minh cùng{" "}
          <span className="text-primary">GraduAI</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Tải lên tài liệu đồ án để AI phân tích và sinh 10 câu hỏi phản biện theo persona.
        </p>
      </div>

      <div className="w-full max-w-3xl space-y-6">
        <div className="rounded-xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <Label htmlFor="persona" className="mb-2 block text-sm font-medium">
            Chọn persona AI
          </Label>
          <select
            id="persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
          >
            {PERSONAS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} - {item.description}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-muted-foreground">
            Sau khi upload xong, hệ thống sẽ gọi backend để sinh câu hỏi thật.
          </p>
        </div>

        <UploadZone onFileSelected={handleFileSelected} />

        {isUploading && (
          <div className="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">
            Đang upload và xử lý tài liệu, chờ một chút...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-3 text-sm text-muted-foreground">
          <Button variant="ghost" asChild>
            <a href="/questions">Xem màn câu hỏi</a>
          </Button>
          <Button variant="ghost" asChild>
            <a href="/report">Xem báo cáo</a>
          </Button>
          
    <div className="min-h-[calc(100vh-4.5rem)] bg-[#f8f9fa] flex flex-col items-center">
      <div className="container mx-auto px-4 lg:px-8 py-16 lg:py-24 flex flex-col items-center w-full max-w-[1100px]">
        <div className="text-center mb-16 max-w-3xl">
          <h1 className="text-[40px] font-bold tracking-tight text-[#0f2e82] mb-5">
            Tải tài liệu - GraduAI
          </h1>
          <p className="text-[17px] text-[#5f6368] leading-relaxed max-w-2xl mx-auto font-medium">
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col">
              <h3 className="text-[#0f2e82] font-bold text-[13px] tracking-wider uppercase mb-7">Tiêu chuẩn tệp</h3>
              
              <div className="space-y-7">
                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-semibold text-[15px] mb-1">Định dạng phù hợp</h4>
                    <p className="text-[13px] text-gray-500 leading-relaxed font-medium">Chỉ chấp nhận các tệp văn bản .pdf hoặc .docx</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-semibold text-[15px] mb-1">Dung lượng tệp</h4>
                    <p className="text-[13px] text-gray-500 leading-relaxed font-medium">Kích thước tệp dưới 50MB để đảm bảo tốc độ</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="mt-0.5">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-semibold text-[15px] mb-1">Bảo mật dữ liệu</h4>
                    <p className="text-[13px] text-gray-500 leading-relaxed font-medium">Tài liệu của bạn được mã hóa và không chia sẻ</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Support Card */}
            <div className="bg-[#0f2e82] rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative flex-1 min-h-[180px] flex flex-col justify-end p-6">
              {/* Image Overlay */}
              <div 
                className="absolute inset-0 z-0 bg-cover bg-center opacity-40 mix-blend-overlay"
                style={{ backgroundImage: "url('https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=1000&auto=format&fit=crop')" }}
              ></div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#051442] via-[#051442]/80 to-transparent z-10"></div>
              
              <div className="relative z-20">
                <h4 className="text-white font-bold mb-1.5 text-[15px]">Cần hỗ trợ?</h4>
                <p className="text-blue-100/80 text-[13px] leading-relaxed font-medium pr-4">Xem hướng dẫn định dạng tài liệu chuẩn IEEE/APA</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
