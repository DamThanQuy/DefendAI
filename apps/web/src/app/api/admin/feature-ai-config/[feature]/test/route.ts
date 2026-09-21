import { NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = 'force-dynamic';

// Proxy feature test — gọi endpoint test backend (embedding dim / vision connection).
// Route: /api/admin/feature-ai-config/:feature/test

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feature: string }> }
) {
  try {
    const { feature } = await params;
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(`${backendUrl()}/api/admin/feature-ai-config/${encodeURIComponent(feature)}/test`, {
      method: "POST",
      headers: {
        ...ngrokHeaders(),
        ...(auth ? { Authorization: auth } : {}),
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Feature test proxy failed", message: e.message }, { status: 500 });
  }
}
