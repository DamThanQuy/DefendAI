/**
 * BFF route: GET /api/documents/multipart/{upload_id}/status
 *
 * Browser dùng để resume upload: kiểm tra parts nào đã upload trên MinIO.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { uploadId: string } },
) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const authHeader = request.headers.get("authorization") || "";

    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;

    const backendRes = await fetch(
      `${backendUrl}/api/documents/multipart/${params.uploadId}/status`,
      { method: "GET", headers },
    );

    const data = await backendRes.json();

    return NextResponse.json(data, { status: backendRes.status });
  } catch (error: any) {
    console.error("multipart/status proxy error:", error);
    return NextResponse.json(
      { error: "Multipart status proxy failed", message: error?.message },
      { status: 500 },
    );
  }
}
