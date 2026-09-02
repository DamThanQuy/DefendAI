"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminUsers } from "@/hooks/useAdminData";

export default function AdminUsersPage() {
  const { users, roleOptions, usersLoading, userMsg, setUserMsg, userSaving, updateUser } = useAdminUsers();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-bold text-foreground mb-2">👥 Quản lý người dùng</h1>
        <p className="text-[14px] text-muted-foreground">Khoá/mở tài khoản và đổi vai trò (student / mentor / admin).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách người dùng</CardTitle>
          <CardDescription>{users.length} người dùng</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userMsg && (
            <p className={`text-sm font-medium ${userMsg.type === "ok" ? "text-teal-400" : "text-red-400"}`}>
              {userMsg.text}
            </p>
          )}
          {usersLoading ? (
            <p className="text-sm text-muted-foreground">Đang tải...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có người dùng.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Họ tên</th>
                    <th className="py-2 pr-4 font-medium">Vai trò</th>
                    <th className="py-2 pr-4 font-medium">Trạng thái</th>
                    <th className="py-2 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 pr-4 font-medium text-foreground">{u.email}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{u.full_name ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <select
                          value={u.roles[0] ?? "student"}
                          disabled={userSaving === u.id}
                          onChange={(e) => updateUser(u.id, { roles: [e.target.value] })}
                          className="px-2 py-1 bg-card border border-border rounded-lg text-[12px] text-foreground focus:outline-none focus:border-primary"
                        >
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${u.is_active ? "bg-teal-500/10 text-teal-400" : "bg-red-500/10 text-red-400"}`}>
                          {u.is_active ? "Hoạt động" : "Khoá"}
                        </span>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => updateUser(u.id, { is_active: !u.is_active })}
                          disabled={userSaving === u.id}
                          className="px-3 py-1 text-[12px] font-semibold text-foreground bg-muted rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          {u.is_active ? "Khoá" : "Mở"}
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
