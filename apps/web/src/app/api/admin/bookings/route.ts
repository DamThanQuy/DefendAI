import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const res = await fetch(`${BACKEND_URL}/api/admin/bookings`, {
      headers: auth ? { Authorization: auth } : {},
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: "Admin bookings proxy failed", message: e.message }, { status: 500 });
  }
}
