import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud } from "lucide-react";

export function UploadZone() {
  return (
    <Card className="w-full border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer">
      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
        <UploadCloud className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Tải lên tài liệu hoặc Source Code</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Kéo thả file vào đây hoặc click để chọn file. Hỗ trợ định dạng PDF, DOCX, ZIP.
        </p>
        <Button>Chọn File</Button>
      </CardContent>
    </Card>
  );
}
