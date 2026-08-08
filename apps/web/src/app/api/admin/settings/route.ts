import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(`${BACKEND_URL}/api/admin/settings`, {
      headers: auth ? { Authorization: auth } : {},
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Admin settings proxy failed", message: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/admin/settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Admin settings proxy failed", message: e.message }, { status: 500 });
  }
}