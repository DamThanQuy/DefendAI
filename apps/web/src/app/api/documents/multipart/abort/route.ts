/**
 * BFF route: DELETE /api/documents/multipart/{upload_id}/abort
 *
 * Browser hủy upload giữa chừng → Next.js chuyển sang BE → BE abort session trên MinIO
 * → giải phóng storage.
 *
 * NOTE: giống complete — client gọi `/api/documents/multipart/{id}/abort`,
 * path đó rơi vào `api/[...path]/route.ts`, không hit file tĩnh này.
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

export async function DELETE(
  request: Request,
  { params }: { params: { uploadId?: string } },
) {
  const uploadId = params?.uploadId;
  if (!uploadId) {
    return NextResponse.json(
      { error: "uploadId is required (path /api/documents/multipart/{id}/abort)" },
      { status: 400 },
    );
  }

  const url = `${backendUrl()}/api/documents/multipart/${uploadId}/abort`;

  let upstream;
  try {
    const backendRes = await fetch(url, {
      method: "DELETE",
      headers: authOnlyHeaders(request),
    });
    upstream = await readUpstream(backendRes);
  } catch (error) {
    console.error("multipart/abort proxy error:", error);
    return upstreamFailure("Multipart abort proxy", { url, status: 502, cause: error });
  }

  if (upstream.nonJson) {
    console.error("multipart/abort non-JSON upstream:", upstream);
    return upstreamFailure("Multipart abort proxy", {
      url,
      status: upstream.status,
      upstream,
    });
  }

  return NextResponse.json(upstream.data, { status: upstream.status });
}
