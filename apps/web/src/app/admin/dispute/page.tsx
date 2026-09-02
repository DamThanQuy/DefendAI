"use client";

import { Fragment, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminBookings, statusBadge } from "@/hooks/useAdminData";

export default function AdminDisputePage() {
  const { bookings, bookingsLoading } = useAdminBookings();
  const [disputeDetail, setDisputeDetail] = useState<number | null>(null);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">⚖️ Dispute Center</h1>
        <p className="text-[14px] text-muted-foreground">
          Xem lịch sử lịch hẹn để phân xử tranh chấp. Module hoàn tiền / giải ngân đang được bổ sung.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Xử lý khiếu nại lịch hẹn</CardTitle>
          <CardDescription>{bookings.length} lịch hẹn</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {bookingsLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lịch hẹn nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Tiêu đề</th>
                    <th className="py-2 pr-4 font-medium">Student</th>
                    <th className="py-2 pr-4 font-medium">Mentor</th>
                    <th className="py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="py-2 font-medium text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {bookings.map((b) => (
                    <Fragment key={b.id}>
                      <tr>
                        <td className="py-2 pr-4 font-medium text-foreground">{b.title}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{b.student_name ?? b.student_email}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{b.mentor_name ?? b.mentor_email}</td>
                        <td className="py-2 pr-4">
                          <span className={statusBadge(b.status)}>{b.status}</span>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => setDisputeDetail(disputeDetail === b.id ? null : b.id)}
                            className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors"
                          >
                            {disputeDetail === b.id ? "Ẩn" : "Xem"}
                          </button>
                        </td>
                      </tr>
                      {disputeDetail === b.id && (
                        <tr>
                          <td colSpan={5} className="py-2">
                            <div className="bg-card/60 rounded-xl p-4 space-y-2 text-[12px] text-muted-foreground">
                              <p><span className="text-primary font-semibold">Ghi chú:</span> {b.note ?? "—"}</p>
                              <p><span className="text-primary font-semibold">Lý do từ chối:</span> {b.reject_reason ?? "—"}</p>
                              <p><span className="text-primary font-semibold">Giờ đề xuất:</span> {b.proposed_time ? new Date(b.proposed_time).toLocaleString("vi-VN") : "—"}</p>
                              <p><span className="text-primary font-semibold">Giờ chốt:</span> {b.confirmed_time ? new Date(b.confirmed_time).toLocaleString("vi-VN") : "—"}</p>
                              <p className="pt-2 text-muted-foreground">Phân xử hoàn tiền / giải ngân: chưa có (cần module tài chính).</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
