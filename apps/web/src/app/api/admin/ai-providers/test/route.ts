import { NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = 'force-dynamic';

// Proxy test provider — gọi POST {backendUrl}/api/admin/ai-providers/{name}/test để kiểm tra kết nối.

async function handleTest(name: string, auth: string) {
  if (!name) {
    return NextResponse.json({ ok: false, detail: "Missing provider name", models: [] }, { status: 400 });
  }
  const res = await fetch(`${backendUrl()}/api/admin/ai-providers/${encodeURIComponent(name)}/test`, {
    method: "POST",
    headers: {
      ...ngrokHeaders(),
      ...(auth ? { Authorization: auth } : {}),
    },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const url = new URL(request.url);
    const name = url.searchParams.get("name") || "";
    return await handleTest(name, auth);
  } catch (e: any) {
    return NextResponse.json({ ok: false, detail: e.message, models: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const url = new URL(request.url);
    let name = url.searchParams.get("name") || "";
    if (!name) {
      const body = await request.json().catch(() => ({}));
      name = body.name || "";
    }
    return await handleTest(name, auth);
  } catch (e: any) {
    return NextResponse.json({ ok: false, detail: e.message, models: [] }, { status: 500 });
  }
}

