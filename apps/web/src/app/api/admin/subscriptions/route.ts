import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(request: Request) {
  return proxy(request, `${BACKEND_URL}/api/admin/subscriptions`);
}

export async function POST(request: Request) {
  return proxy(request, `${BACKEND_URL}/api/admin/subscriptions`, "POST");
}

async function proxy(request: Request, url: string, method = "GET") {
  try {
    const auth = request.headers.get("authorization") || "";
    const headers: HeadersInit = { ...(auth ? { Authorization: auth } : {}) };
    if (method === "POST") headers["Content-Type"] = "application/json";
    const res = await fetch(url, {
      method,
      headers,
      ...(method === "POST" ? { body: await request.text() } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status === 404) {
      return NextResponse.json(
        { error: "Backend chưa nhận API quản lý subscription. Hãy khởi động lại service API.", detail: data.detail || "Subscription endpoint not found" },
        { status: 502 },
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: "Subscription proxy failed", message: String(error) }, { status: 500 });
  }
}
