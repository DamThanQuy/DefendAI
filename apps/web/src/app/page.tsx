import { UploadZone } from "@/components/features/assessment/UploadZone";

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center max-w-2xl mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">
          Bảo vệ đồ án thông minh cùng <span className="text-primary">GraduAI</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Tải lên tài liệu đồ án hoặc mã nguồn của bạn để hệ thống AI đánh giá, tìm lỗi và giả lập phiên hỏi đáp bảo vệ.
        </p>
      </div>
      <div className="w-full max-w-3xl">
        <UploadZone />
      </div>
    </div>
  );
}
