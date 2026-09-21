import { NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = 'force-dynamic';

// Proxy test provider — GET {base_url}/models để kiểm tra kết nối.

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name) {
      return NextResponse.json({ ok: false, detail: "Missing provider name", models: [] }, { status: 400 });
    }
    const res = await fetch(`${backendUrl()}/api/admin/ai-providers/${encodeURIComponent(name)}/test`, {
      headers: {
        ...ngrokHeaders(),
        ...(auth ? { Authorization: auth } : {}),
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, detail: e.message, models: [] }, { status: 500 });
  }
}
