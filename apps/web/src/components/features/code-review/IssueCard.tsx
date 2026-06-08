import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function IssueCard() {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg text-red-600 dark:text-red-400">SQL Injection Vulnerability</CardTitle>
          <span className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded-full font-medium">Critical</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Phát hiện nối chuỗi SQL trực tiếp tại file `src/api/user.py` dòng 45. Điều này có thể dẫn đến lỗi bảo mật nghiêm trọng.
        </p>
        <div className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto">
          <code>{"query = f\"SELECT * FROM users WHERE username = '{username}'\""}</code>
        </div>
      </CardContent>
    </Card>
  );
}
