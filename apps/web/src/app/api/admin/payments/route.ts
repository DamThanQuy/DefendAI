import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const response = await fetch(`${BACKEND}/api/admin/payments/pending`, { headers: auth ? { Authorization: auth } : {}, cache: "no-store" });
  return NextResponse.json(await response.json(), { status: response.status });
}
