import type { CodeIssue } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/common/Badges";

interface IssueCardProps {
  issue: CodeIssue;
}

export function IssueCard({ issue }: IssueCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-base font-mono">
            {issue.file}:{issue.line}
          </CardTitle>
          <SeverityBadge severity={issue.severity} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{issue.description}</p>
        <p className="text-xs text-primary font-medium">
          Gợi ý: {issue.suggestion}
        </p>
      </CardContent>
    </Card>
  );
}
