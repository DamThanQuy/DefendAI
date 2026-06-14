import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const steps = [
  { step: 1, text: "Tải tài liệu đồ án tại trang chủ" },
  { step: 2, text: "AI sẽ đọc và phân tích nội dung" },
  { step: 3, text: "Bắt đầu buổi bảo vệ giả lập" },
];

export default function RoomPage() {
  return (
    <div className="container mx-auto px-4 py-12 min-h-[80vh]">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Mock Room"
          description="Môi trường giả lập buổi bảo vệ đồ án với AI làm giám khảo."
        />

        <Card className="border-0 shadow-xl bg-card/50 backdrop-blur-sm ring-1 ring-primary/10">
          <CardHeader>
            <CardTitle className="text-2xl">Sẵn sàng bắt đầu?</CardTitle>
            <CardDescription>
              AI sẽ đóng vai trò hội đồng bảo vệ và đặt câu hỏi dựa trên tài
              liệu bạn đã tải lên.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {steps.map((s) => (
                <div
                  key={s.step}
                  className="p-4 rounded-lg bg-background/50 border"
                >
                  <p className="text-sm font-semibold mb-1">Bước {s.step}</p>
                  <p className="text-xs text-muted-foreground">{s.text}</p>
                </div>
              ))}
            </div>
            <Button
              className="w-full h-11 text-base font-semibold"
              disabled
            >
              Bắt đầu Mock Room
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Vui lòng tải tài liệu trước khi bắt đầu.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
