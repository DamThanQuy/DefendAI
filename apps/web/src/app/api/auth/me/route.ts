import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: authorization ? { Authorization: authorization } : {},
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ detail: "Auth service returned an invalid response" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { detail: "Không kết nối được máy chủ xác thực", error: String(error) },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      method: "PUT",
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        "Content-Type": "application/json",
      },
      body: await request.text(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({ detail: "Auth service returned an invalid response" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ detail: "Không kết nối được máy chủ xác thực", error: String(error) }, { status: 502 });
  }
}