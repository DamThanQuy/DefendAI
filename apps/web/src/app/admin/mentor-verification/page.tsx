"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminUsers } from "@/hooks/useAdminData";

export default function AdminMentorVerificationPage() {
  const { users, usersLoading, userSaving, updateUser } = useAdminUsers();
  const mentors = users.filter((u) => u.roles.includes("mentor"));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">🎓 Duyệt & Xác minh hồ sơ Mentor</h1>
        <p className="text-[14px] text-muted-foreground">
          Danh sách Mentor. Duyệt (kích hoạt) / Từ chối (khoá). Module xác minh hồ sơ chi tiết (bằng cấp, LinkedIn) đang được bổ sung.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách Mentor</CardTitle>
          <CardDescription>{mentors.length} mentor</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usersLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : mentors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có Mentor nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Họ tên</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="py-2 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {mentors.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-4 font-medium text-foreground">{m.full_name ?? "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.email}</td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${m.is_active ? "bg-teal-500/10 text-teal-400" : "bg-red-500/10 text-red-400"}`}>
                          {m.is_active ? "Đã duyệt" : "Khoá"}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => updateUser(m.id, { is_active: true })}
                          disabled={userSaving === m.id || m.is_active}
                          className="px-3 py-1 text-[12px] font-semibold text-teal-400 bg-teal-500/10 rounded-lg hover:bg-teal-500/20 transition-colors disabled:opacity-40"
                        >
                          Duyệt
                        </button>
                        <button
                          onClick={() => updateUser(m.id, { is_active: false })}
                          disabled={userSaving === m.id || !m.is_active}
                          className="ml-2 px-3 py-1 text-[12px] font-semibold text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-40"
                        >
                          Từ chối
                        </button>
                      </td>
                    </tr>
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
