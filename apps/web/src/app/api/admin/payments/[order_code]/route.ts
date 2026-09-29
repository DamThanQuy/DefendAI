import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

type Context = { params: { order_code: string } };

export async function POST(request: NextRequest, context: Context) {
  const auth = request.headers.get("authorization") || "";
  const response = await fetch(`${BACKEND}/api/admin/payments/${context.params.order_code}/confirm`, {
    method: "POST",
    headers: { ...(auth ? { Authorization: auth } : {}), "Content-Type": "application/json" },
    body: await request.text(),
  });
  return NextResponse.json(await response.json(), { status: response.status });
}
