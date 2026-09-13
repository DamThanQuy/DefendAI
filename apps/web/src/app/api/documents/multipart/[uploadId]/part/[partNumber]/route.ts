/**
 * BFF route: PUT /api/documents/multipart/[uploadId]/part/[partNumber]
 *
 * Browser gửi chunk binary → Next.js proxy → FastAPI → MinIO.
 * Dùng khi browser không thể upload trực tiếp lên MinIO (không có public IP).
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

export async function PUT(
  request: Request,
  { params }: { params: { uploadId: string; partNumber: string } },
) {
  const { uploadId, partNumber } = params;
  const url = `${backendUrl()}/api/documents/multipart/${uploadId}/part/${partNumber}`;

  let body: ArrayBuffer;
  try {
    body = await request.arrayBuffer();
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 },
    );
  }

  if (body.byteLength === 0) {
    return NextResponse.json(
      { error: "Empty body" },
      { status: 400 },
    );
  }

  let upstream;
  try {
    const backendRes = await fetch(url, {
      method: "PUT",
      headers: authOnlyHeaders(request, {
        "Content-Type": "application/octet-stream",
      }),
      body,
    });
    upstream = await readUpstream(backendRes);
  } catch (error) {
    console.error("multipart part proxy error:", error);
    return upstreamFailure("Multipart part upload proxy", {
      url,
      status: 502,
      cause: error,
    });
  }

  if (upstream.nonJson) {
    return upstreamFailure("Multipart part upload proxy", {
      url,
      status: upstream.status,
      upstream,
    });
  }

  return NextResponse.json(upstream.data, { status: upstream.status });
}
