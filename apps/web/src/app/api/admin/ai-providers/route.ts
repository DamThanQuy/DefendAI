import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

// Proxy AI provider/model/feature config — admin quản provider & model qua UI.

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(`${BACKEND_URL}/api/admin/ai-providers`, {
      headers: auth ? { Authorization: auth } : {},
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "AI providers proxy failed", message: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/admin/ai-providers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "AI providers proxy failed", message: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const url = new URL(request.url);
    const name = url.searchParams.get("name");
    if (!name) {
      return NextResponse.json({ error: "Missing provider name" }, { status: 400 });
    }
    const res = await fetch(`${BACKEND_URL}/api/admin/ai-providers/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: auth ? { Authorization: auth } : {},
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "AI providers proxy failed", message: e.message }, { status: 500 });
  }
}
