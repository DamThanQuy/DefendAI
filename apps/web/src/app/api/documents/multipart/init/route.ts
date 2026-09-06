/**
 * BFF route: POST /api/documents/multipart/init
 *
 * Browser gọi Next.js → Next.js gọi FastAPI /api/documents/multipart/init
 * → nhận upload_id + danh sách presigned URLs → trả về cho browser.
 *
 * Next.js BFF chỉ proxy JSON (rất nhẹ), không upload bytes → tránh giới hạn 1MB.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface InitBody {
  filename: string;
  size: number;
  mime?: string;
  purpose?: string;
}

export async function POST(request: Request) {
  try {
    const body: InitBody = await request.json();
    if (!body.filename || !body.size) {
      return NextResponse.json(
        { error: "filename and size are required" },
        { status: 400 },
      );
    }

    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const authHeader = request.headers.get("authorization") || "";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) headers["Authorization"] = authHeader;

    const backendRes = await fetch(`${backendUrl}/api/documents/multipart/init`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    return NextResponse.json(data, { status: backendRes.status });
  } catch (error: any) {
    console.error("multipart/init proxy error:", error);
    return NextResponse.json(
      { error: "Multipart init proxy failed", message: error?.message },
      { status: 500 },
    );
  }
}
