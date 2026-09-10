import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

type Context = { params: { id: string } };

export async function PUT(request: Request, { params }: Context) {
  return proxy(request, `${BACKEND_URL}/api/admin/subscriptions/${params.id}`, "PUT");
}

export async function DELETE(request: Request, { params }: Context) {
  return proxy(request, `${BACKEND_URL}/api/admin/subscriptions/${params.id}`, "DELETE");
}

async function proxy(request: Request, url: string, method: "PUT" | "DELETE") {
  try {
    const auth = request.headers.get("authorization") || "";
    const headers: HeadersInit = {
      ...(auth ? { Authorization: auth } : {}),
      ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
    };
    const res = await fetch(url, {
      method,
      headers,
      ...(method === "PUT" ? { body: await request.text() } : {}),
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
