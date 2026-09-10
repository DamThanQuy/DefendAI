/**
 * BFF route: DELETE /api/documents/multipart/{upload_id}/abort
 *
 * Browser hủy upload giữa chừng → Next.js chuyển sang BE → BE abort session trên MinIO
 * → giải phóng storage.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { uploadId: string } },
) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const authHeader = request.headers.get("authorization") || "";

    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;

    const backendRes = await fetch(
      `${backendUrl}/api/documents/multipart/${params.uploadId}/abort`,
      { method: "DELETE", headers },
    );

    const data = await backendRes.json().catch(() => ({}));

    return NextResponse.json(data, { status: backendRes.status });
  } catch (error: any) {
    console.error("multipart/abort proxy error:", error);
    return NextResponse.json(
      { error: "Multipart abort proxy failed", message: error?.message },
      { status: 500 },
    );
  }
}
