import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CodeReviewResult() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Tổng quan Đánh giá Source Code</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-lg">
            <span className="text-2xl font-bold">3</span>
            <p className="text-sm">Bảo mật (Critical)</p>
          </div>
          <div className="p-4 bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 rounded-lg">
            <span className="text-2xl font-bold">12</span>
            <p className="text-sm">Cảnh báo (Warning)</p>
          </div>
          <div className="p-4 bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-lg">
            <span className="text-2xl font-bold">A-</span>
            <p className="text-sm">Điểm chất lượng</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
