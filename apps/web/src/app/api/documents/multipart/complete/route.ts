/**
 * BFF route: POST /api/documents/multipart/{upload_id}/complete
 *
 * Browser báo đã upload xong tất cả parts → Next.js chuyển sang BE
 * → BE verify ETags trên MinIO → merge thành 1 file → tạo Document record.
 *
 * NOTE: client gọi `/api/documents/multipart/{id}/complete`. Đường dẫn đó
 * KHÔNG khớp file tĩnh này (thiếu segment `[uploadId]`) mà rơi vào
 * `api/[...path]/route.ts`. File này chỉ được hit ở path literal
 * `/api/documents/multipart/complete`. Giữ logic an toàn ở cả hai nơi.
 */
import { NextResponse } from "next/server";
import {
  authOnlyHeaders,
  backendUrl,
  readUpstream,
  upstreamFailure,
} from "@/lib/upstream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CompleteBody {
  parts: { PartNumber: number; ETag: string }[];
}

export async function POST(
  request: Request,
  { params }: { params: { uploadId?: string } },
) {
  const uploadId = params?.uploadId;
  if (!uploadId) {
    return NextResponse.json(
      { error: "uploadId is required (path /api/documents/multipart/{id}/complete)" },
      { status: 400 },
    );
  }

  let body: CompleteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.parts) || body.parts.length === 0) {
    return NextResponse.json(
      { error: "parts must be a non-empty array" },
      { status: 400 },
    );
  }

  const url = `${backendUrl()}/api/documents/multipart/${uploadId}/complete`;

  let upstream;
  try {
    const backendRes = await fetch(url, {
      method: "POST",
      headers: authOnlyHeaders(request, { "Content-Type": "application/json" }),
      body: JSON.stringify({ parts: body.parts }),
    });
    upstream = await readUpstream(backendRes);
  } catch (error) {
    console.error("multipart/complete proxy error:", error);
    return upstreamFailure("Multipart complete proxy", { url, status: 502, cause: error });
  }

  if (upstream.nonJson) {
    console.error("multipart/complete non-JSON upstream:", upstream);
    return upstreamFailure("Multipart complete proxy", {
      url,
      status: upstream.status,
      upstream,
    });
  }

  return NextResponse.json(upstream.data, { status: upstream.status });
}
