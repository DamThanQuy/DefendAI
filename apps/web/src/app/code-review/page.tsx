import { PageHeader } from "@/components/common/PageHeader";
import { IssueCard } from "@/components/features/code-review/IssueCard";
import { Button } from "@/components/ui/button";
import { sampleIssues } from "@/data/sample";

export default function CodeReviewPage() {
  return (
    <div className="container mx-auto px-4 py-12 min-h-[80vh]">
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="Code Review"
          description="Phân tích mã nguồn và gợi ý cải thiện từ AI."
        />

        <div className="grid gap-4">
          {sampleIssues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>

        <div className="mt-8 text-center">
          <Button variant="outline">Quét lại mã nguồn</Button>
        </div>
      </div>
    </div>
  );
}
