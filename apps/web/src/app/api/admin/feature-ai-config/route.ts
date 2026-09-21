import { NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = 'force-dynamic';

// Proxy feature → provider/model mapping — admin chọn model cho từng chức năng AI.

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(`${backendUrl()}/api/admin/feature-ai-config`, {
      headers: {
        ...ngrokHeaders(),
        ...(auth ? { Authorization: auth } : {}),
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Feature AI config proxy failed", message: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const body = await request.json();
    const res = await fetch(`${backendUrl()}/api/admin/feature-ai-config`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Feature AI config proxy failed", message: e.message }, { status: 500 });
  }
}
