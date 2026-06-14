import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/features/report/MetricCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sampleMetrics } from "@/data/sample";

export default function ReportPage() {
  return (
    <div className="container mx-auto px-4 py-12 min-h-[80vh]">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Báo cáo"
          description="Tổng hợp kết quả buổi bảo vệ giả lập của bạn."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          {sampleMetrics.map((m) => (
            <MetricCard key={m.label} metric={m} />
          ))}
        </div>

        <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm ring-1 ring-primary/10">
          <CardHeader>
            <CardTitle className="text-xl">Đánh giá tổng quan</CardTitle>
            <CardDescription>
              Bạn đã trả lời tốt 83% số câu hỏi. Hãy luyện tập thêm các câu
              hỏi về kiến thức kỹ thuật để cải thiện.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Điểm mạnh</p>
              <p className="text-xs text-muted-foreground">
                Trình bày rõ ràng, tự tin về mục tiêu dự án.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Cần cải thiện</p>
              <p className="text-xs text-muted-foreground">
                Chi tiết kỹ thuật, xử lý edge cases, so sánh với các giải pháp
                khác.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex gap-4 justify-center">
          <Button variant="outline">Xuất PDF</Button>
          <Button>Làm lại</Button>
        </div>
      </div>
    </div>
  );
}
