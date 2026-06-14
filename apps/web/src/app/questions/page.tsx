import { PageHeader } from "@/components/common/PageHeader";
import { QuestionCard } from "@/components/features/questions/QuestionCard";
import { Button } from "@/components/ui/button";
import { sampleQuestions } from "@/data/sample";

export default function QuestionsPage() {
  return (
    <div className="container mx-auto px-4 py-12 min-h-[80vh]">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Kết quả AI"
          description="Câu hỏi và gợi ý trả lời do AI sinh ra dựa trên tài liệu của bạn."
        />

        <div className="grid gap-4">
          {sampleQuestions.map((q) => (
            <QuestionCard key={q.id} question={q} />
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button variant="outline">Tải thêm câu hỏi</Button>
        </div>
      </div>
    </div>
  );
}
