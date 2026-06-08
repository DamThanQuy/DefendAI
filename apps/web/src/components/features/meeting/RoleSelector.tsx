import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function RoleSelector() {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-2">
        <Label className="text-sm font-semibold mb-2">Chọn vai trò mô phỏng</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="role" value="teacher" defaultChecked className="accent-primary" />
            Giáo viên hướng dẫn
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="role" value="reviewer" className="accent-primary" />
            Hội đồng phản biện
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
