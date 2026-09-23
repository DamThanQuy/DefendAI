/**
 * BFF route: POST /api/documents/multipart/init
 *
 * Browser gọi Next.js → Next.js gọi FastAPI /api/documents/multipart/init
 * → nhận upload_id + danh sách presigned URLs → trả về cho browser.
 *
 * Next.js BFF chỉ proxy JSON (rất nhẹ), không upload bytes → tránh giới hạn 1MB.
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

interface InitBody {
  filename: string;
  size: number;
  mime?: string;
  purpose?: string;
}

export async function POST(request: Request) {
  const url = `${backendUrl()}/api/documents/multipart/init`;

  let body: InitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!body.filename || !body.size) {
    return NextResponse.json(
      { error: "filename and size are required" },
      { status: 400 },
    );
  }

  let upstream;
  try {
    const backendRes = await fetch(url, {
      method: "POST",
      headers: authOnlyHeaders(request, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    upstream = await readUpstream(backendRes);
  } catch (error) {
    // Network-level: backend không resolve được / không trả lời.
    console.error("multipart/init proxy error:", error);
    return upstreamFailure("Multipart init proxy", {
      url,
      status: 502,
      cause: error,
    });
  }

  if (upstream.nonJson) {
    // Upstream trả về không phải JSON (HTML 502/504, body lỗi...) — lộ nguyên nhân.
    console.error("multipart/init non-JSON upstream:", upstream);
    return upstreamFailure("Multipart init proxy", {
      url,
      status: upstream.status,
      upstream,
    });
  }

  // JSON (kể cả error JSON từ FastAPI) → forward nguyên trạng + status thật.
  return NextResponse.json(upstream.data, { status: upstream.status });
}
