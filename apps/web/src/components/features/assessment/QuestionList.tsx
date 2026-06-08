import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

export function QuestionList() {
  const questions = Array.from({ length: 10 }).map((_, i) => `Câu hỏi mô phỏng ${i + 1}: Bạn xử lý tình huống X như thế nào?`);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Danh sách câu hỏi dự kiến</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[400px] w-full px-6">
          <div className="flex flex-col gap-4 pb-6">
            {questions.map((q, idx) => (
              <div key={idx} className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
                <p className="font-medium text-sm mb-2">{q}</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm">Gợi ý trả lời</Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
