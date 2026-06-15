import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function QuestionsPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Kết quả phân tích (AI Results)</h1>
          <p className="text-muted-foreground mt-2 text-gray-500">Danh sách các câu hỏi dự kiến hội đồng sẽ hỏi dựa trên đồ án của bạn.</p>
        </div>
        <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg">
          Làm mới kết quả
        </Button>
      </div>

      <div className="grid gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-l-4 border-l-blue-500 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <CardTitle className="text-xl text-blue-700">Câu hỏi {i}: Tại sao bạn lại chọn công nghệ này?</CardTitle>
                <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">Độ khó: Cao</span>
              </div>
              <CardDescription className="mt-1">Gợi ý trả lời từ AI</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Hãy tập trung vào ưu điểm của framework (ví dụ: hiệu năng, tính cộng đồng, khả năng mở rộng) và so sánh ngắn gọn với các lựa chọn thay thế mà bạn đã cân nhắc trong quá trình nghiên cứu.
              </p>
              <div className="mt-6 flex gap-3">
                <Button variant="outline" size="sm" className="border-blue-200 text-blue-700 hover:bg-blue-50">Xem chi tiết</Button>
                <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50 font-semibold">✓ Đã chuẩn bị tốt</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
