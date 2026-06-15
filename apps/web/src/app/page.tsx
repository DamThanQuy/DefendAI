"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { UploadZone } from "@/components/features/assessment/UploadZone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadDocument } from "@/lib/api";
import { PERSONAS } from "@/lib/constants";

export default function HomePage() {
  const router = useRouter();
  const [persona, setPersona] = useState("ly_thuyet");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const response = await uploadDocument(file);
      router.push(`/questions?documentId=${response.data.id}&persona=${persona}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload thất bại";
      setError(message);
      setIsUploading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-[80vh] flex-col items-center justify-center px-4 py-12">
      <div className="mb-12 max-w-2xl text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
          MVP: Upload, AI hỏi đáp, Mock Defense
        </p>
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
          Bảo vệ đồ án thông minh cùng{" "}
          <span className="text-primary">GraduAI</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Tải lên tài liệu đồ án để AI phân tích và sinh 10 câu hỏi phản biện theo persona.
        </p>
      </div>

      <div className="w-full max-w-3xl space-y-6">
        <div className="rounded-xl border bg-card/60 p-4 shadow-sm backdrop-blur-sm">
          <Label htmlFor="persona" className="mb-2 block text-sm font-medium">
            Chọn persona AI
          </Label>
          <select
            id="persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
          >
            {PERSONAS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label} - {item.description}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-muted-foreground">
            Sau khi upload xong, hệ thống sẽ gọi backend để sinh câu hỏi thật.
          </p>
        </div>

        <UploadZone onFileSelected={handleFileSelected} />

        {isUploading && (
          <div className="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">
            Đang upload và xử lý tài liệu, chờ một chút...
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-3 text-sm text-muted-foreground">
          <Button variant="ghost" asChild>
            <a href="/questions">Xem màn câu hỏi</a>
          </Button>
          <Button variant="ghost" asChild>
            <a href="/report">Xem báo cáo</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
