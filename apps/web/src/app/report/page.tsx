import { RadarChart } from "@/components/features/report/RadarChart";
import { PDFExport } from "@/components/features/report/PDFExport";

export default function ReportPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Báo cáo đánh giá tổng thể</h1>
        <PDFExport />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <RadarChart />
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Nhận xét từ hệ thống</h2>
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-muted-foreground leading-relaxed">
              Bạn có kiến thức chuyên môn khá tốt, đặc biệt là trong giao tiếp và trình bày. 
              Tuy nhiên, kỹ năng code cần chú ý hơn về mặt bảo mật (ví dụ như các lỗi SQL Injection đã phát hiện). 
              Khả năng phản xạ câu hỏi nằm ở mức khá, cần cải thiện sự tự tin khi bị vặn hỏi sâu về kiến trúc hệ thống.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
