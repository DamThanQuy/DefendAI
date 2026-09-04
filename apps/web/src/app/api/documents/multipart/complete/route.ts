/**
 * BFF route: POST /api/documents/multipart/{upload_id}/complete
 *
 * Browser báo đã upload xong tất cả parts → Next.js chuyển sang BE
 * → BE verify ETags trên MinIO → merge thành 1 file → tạo Document record.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CompleteBody {
  parts: { PartNumber: number; ETag: string }[];
}

export async function POST(
  request: Request,
  { params }: { params: { uploadId: string } },
) {
  try {
    const body: CompleteBody = await request.json();
    if (!Array.isArray(body.parts) || body.parts.length === 0) {
      return NextResponse.json(
        { error: "parts must be a non-empty array" },
        { status: 400 },
      );
    }

    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const authHeader = request.headers.get("authorization") || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) headers["Authorization"] = authHeader;

    const backendRes = await fetch(
      `${backendUrl}/api/documents/multipart/${params.uploadId}/complete`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ parts: body.parts }),
      },
    );

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (error: any) {
    console.error("multipart/complete proxy error:", error);
    return NextResponse.json(
      { error: "Multipart complete proxy failed", message: error?.message },
      { status: 500 },
    );
  }
}
