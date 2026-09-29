import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

type Context = { params: { order_code: string } };

async function proxy(request: NextRequest, context: Context, method: "GET" | "POST") {
  try {
    const auth = request.headers.get("authorization") || "";
    const response = await fetch(`${BACKEND}/api/payment/orders/${context.params.order_code}${method === "POST" ? "/submitted" : ""}`, {
      method,
      headers: { ...(auth ? { Authorization: auth } : {}), ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      ...(method === "POST" ? { body: await request.text() } : {}),
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: "Payment proxy failed", message: String(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: Context) {
  return proxy(request, context, "GET");
}

export async function POST(request: NextRequest, context: Context) {
  return proxy(request, context, "POST");
}
