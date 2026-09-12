import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

// Proxy feature test — gọi endpoint test backend (embedding dim / vision connection).
// Route: /api/admin/feature-ai-config/:feature/test

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feature: string }> }
) {
  try {
    const { feature } = await params;
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(`${BACKEND_URL}/api/admin/feature-ai-config/${encodeURIComponent(feature)}/test`, {
      method: "POST",
      headers: auth ? { Authorization: auth } : {},
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Feature test proxy failed", message: e.message }, { status: 500 });
  }
}
