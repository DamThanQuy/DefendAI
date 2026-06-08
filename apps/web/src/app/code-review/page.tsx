import { CodeReviewResult } from "@/components/features/code-review/CodeReviewResult";
import { IssueCard } from "@/components/features/code-review/IssueCard";

export default function CodeReviewPage() {
  return (
    <div className="container mx-auto px-4 py-8 flex flex-col gap-8">
      <h1 className="text-3xl font-bold">Kết quả Code Review</h1>
      <CodeReviewResult />
      
      <div>
        <h2 className="text-2xl font-semibold mb-4">Chi tiết các lỗi</h2>
        <div className="flex flex-col gap-4">
          <IssueCard />
          <IssueCard />
        </div>
      </div>
    </div>
  );
}
