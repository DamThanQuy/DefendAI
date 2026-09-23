/**
 * BFF route: GET /api/documents/multipart/{upload_id}/status
 *
 * Browser dùng để resume upload: kiểm tra parts nào đã upload trên MinIO.
 *
 * NOTE: route này nằm ở path TĨNH `/api/documents/multipart/status`, nên
 * Next.js KHÔNG truyền `params.uploadId` (trước đây code đọc
 * `params.uploadId` → crash `Cannot read properties of undefined`).
 * Upload id được lấy từ query string `?upload_id=...` (hoặc `?uploadId=...`).
 * Client hiện chưa gọi endpoint này; path resume động
 * `/api/documents/multipart/{id}/status` sẽ do `api/[...path]` phục vụ.
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uploadId =
    searchParams.get("upload_id") || searchParams.get("uploadId") || "";

  if (!uploadId) {
    return NextResponse.json(
      { error: "upload_id query param is required" },
      { status: 400 },
    );
  }

  const url = `${backendUrl()}/api/documents/multipart/${uploadId}/status`;

  let upstream;
  try {
    const backendRes = await fetch(url, {
      method: "GET",
      headers: authOnlyHeaders(request),
    });
    upstream = await readUpstream(backendRes);
  } catch (error) {
    console.error("multipart/status proxy error:", error);
    return upstreamFailure("Multipart status proxy", { url, status: 502, cause: error });
  }

  if (upstream.nonJson) {
    console.error("multipart/status non-JSON upstream:", upstream);
    return upstreamFailure("Multipart status proxy", {
      url,
      status: upstream.status,
      upstream,
    });
  }

  return NextResponse.json(upstream.data, { status: upstream.status });
}
