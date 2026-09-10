"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminModerationPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">🛡️ Kiểm duyệt nội dung & An ninh</h1>
        <p className="text-[14px] text-muted-foreground">
          Danh sách nội dung bị báo cáo (Flagged Content). Thực thi chế tài cảnh báo / khoá / ban.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Flagged Content</CardTitle>
          <CardDescription>Danh sách nội dung bị báo cáo.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Chưa có nội dung bị báo cáo. Bộ lọc tự động &amp; luồng Report đang được phát triển.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
