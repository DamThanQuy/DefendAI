"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminReviews } from "@/hooks/useAdminData";

export default function AdminAiMonitorPage() {
  const { reviews, reviewsLoading, reviewDetail, setReviewDetail, detailLoading, openReview } = useAdminReviews();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">🤖 Giám sát AI — Code Review</h1>
        <p className="text-[14px] text-muted-foreground">Xem mọi lượt quét của mọi user (giám sát hệ thống).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách lượt quét</CardTitle>
          <CardDescription>{reviews.length} lượt quét</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reviewsLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lượt code review nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">User</th>
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="py-2 pr-4 font-medium text-right">Files</th>
                    <th className="py-2 pr-4 font-medium">Thống kê</th>
                    <th className="py-2 font-medium text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {reviews.map((r) => (
                    <tr key={r.analysis_id}>
                      <td className="py-2 pr-4 font-medium text-foreground">{r.user_email}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{r.document_name}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${r.status === "completed" ? "bg-teal-500/10 text-teal-400" : r.status === "failed" ? "bg-red-500/10 text-red-400" : "bg-muted/40 text-foreground"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right text-muted-foreground">{r.total_files ?? "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {r.stats ? Object.entries(r.stats).map(([k, v]) => `${k}:${v}`).join(" · ") : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => openReview(r.analysis_id)}
                          className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                        >
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {detailLoading && <p className="text-sm text-muted-foreground">Đang tải chi tiết...</p>}
          {reviewDetail && (
            <div className="bg-card/60 rounded-xl p-4 space-y-2 max-h-80 overflow-y-auto">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-semibold text-primary">Chi tiết analysis</span>
                <button onClick={() => setReviewDetail(null)} className="text-[12px] text-muted-foreground hover:text-foreground">Đóng</button>
              </div>
              {reviewDetail.error ? (
                <p className="text-[12px] text-red-400">{String(reviewDetail.error)}</p>
              ) : (
                <pre className="text-[12px] text-muted-foreground whitespace-pre-wrap">
                  {JSON.stringify(
                    {
                      status: reviewDetail.status,
                      summary: reviewDetail.summary,
                      total_files: reviewDetail.total_files,
                      stats: reviewDetail.stats,
                      issues_count: Array.isArray(reviewDetail.issues) ? reviewDetail.issues.length : 0,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
