<<<<<<< HEAD
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
=======
"use client";

import { useState } from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { IssueCard } from "@/components/features/code-review/IssueCard";
import { UploadZone } from "@/components/features/assessment/UploadZone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { scanCode, uploadDocument, type CodeScanResponse } from "@/lib/api";
>>>>>>> 73a3644 ([FEAT]: Tich hop AI de scan file")

export default function CodeReviewPage() {
  const [result, setResult] = useState<CodeScanResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "scanning" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (file: File) => {
    setError(null);
    setStatus("uploading");
    setResult(null);

    try {
      const uploadResponse = await uploadDocument(file);
      setStatus("scanning");
      const scanResponse = await scanCode(uploadResponse.data.id);
      setResult(scanResponse.data);
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể quét source code";
      setError(message);
      setStatus("error");
    }
  };

  return (
<<<<<<< HEAD
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="mb-12 text-center animate-in fade-in zoom-in duration-500">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-4">Code Review <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">AI</span></h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
          Hệ thống AI đã phân tích mã nguồn của bạn. Dưới đây là các lỗ hổng, lỗi tiềm ẩn và đề xuất tối ưu hóa.
        </p>
=======
    <div className="container mx-auto min-h-[80vh] px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Code Review"
          description="Upload ZIP source code để backend quét lỗi, code smell và rủi ro bảo mật bằng AI."
        />

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <UploadZone
              title="Kéo thả ZIP source code vào đây"
              description="Backend sẽ upload file, scan code và trả về issues thật."
              accept=".zip"
              buttonLabel="Chọn ZIP"
              onFileSelected={handleFileSelected}
            />

            {status === "uploading" && (
              <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                Đang upload file ZIP...
              </div>
            )}

            {status === "scanning" && (
              <div className="rounded-xl border bg-card/60 p-4 text-sm text-muted-foreground">
                Backend đang quét source code và gọi AI...
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex justify-center">
              <Button variant="outline" asChild>
                <a href="/">Quay về trang chủ</a>
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Tổng quan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Trạng thái</span>
                  <span className="font-medium">{result?.status ?? status}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Pass rate</span>
                  <span className="font-medium">{result ? `${result.pass_rate.toFixed(1)}%` : "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Files scanned</span>
                  <span className="font-medium">{result?.files_scanned ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-medium">{result?.provider ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Model</span>
                  <span className="font-medium">{result?.model ?? "-"}</span>
                </div>
              </CardContent>
            </Card>

            {result ? (
              <Card>
                <CardHeader>
                  <CardTitle>Kết quả</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{result.summary}</p>
                  <p>
                    <span className="font-medium">Số issue:</span> {result.issues.length}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Chưa có dữ liệu</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Upload ZIP source code để xem kết quả quét ở đây.
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {result?.issues?.length ? (
          <div className="mt-8 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Issues</h2>
              <p className="text-sm text-muted-foreground">Danh sách vấn đề backend phát hiện trong source code.</p>
            </div>
            <div className="grid gap-4">
              {result.issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          </div>
        ) : null}
>>>>>>> 73a3644 ([FEAT]: Tich hop AI de scan file")
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Card className="bg-red-50 border-red-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-700 text-lg">Lỗi nghiêm trọng (Critical)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-black text-red-600">2</p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-yellow-700 text-lg">Cảnh báo (Warnings)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-black text-yellow-600">8</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-100 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-green-700 text-lg">Tối ưu (Optimization)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-5xl font-black text-green-600">14</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg border-gray-200 animate-in fade-in slide-in-from-bottom-8 duration-1000 overflow-hidden">
        <CardHeader className="bg-gray-50/80 border-b">
          <CardTitle>Chi tiết các vấn đề</CardTitle>
          <CardDescription>File: <span className="font-mono text-blue-600">src/services/api.js</span></CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-6 border-b hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-md">Critical</span>
              <h4 className="font-semibold text-lg">SQL Injection Vulnerability</h4>
            </div>
            <p className="text-sm text-gray-600 mb-4">Lỗi nối chuỗi trực tiếp trong câu query SQL. Hãy sử dụng parameterized queries hoặc ORM để bảo mật dữ liệu.</p>
            <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-sm overflow-x-auto shadow-inner">
              <div className="text-red-400 line-through opacity-80">- const query = "SELECT * FROM users WHERE id = " + userId;</div>
              <div className="text-green-400 font-bold mt-1">+ const query = "SELECT * FROM users WHERE id = ?";</div>
            </div>
          </div>
          <div className="p-6 hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-md">Warning</span>
              <h4 className="font-semibold text-lg">Missing Error Handling</h4>
            </div>
            <p className="text-sm text-gray-600">Hàm fetch API không có khối try-catch, có thể làm crash ứng dụng nếu server phản hồi lỗi.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
