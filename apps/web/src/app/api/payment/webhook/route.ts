import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders, readUpstream } from "@/lib/upstream";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${backendUrl()}/api/payment/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ngrokHeaders() },
      body: await request.text(),
      signal: AbortSignal.timeout(20_000),
    });
    const upstream = await readUpstream(response);
    if (!upstream.nonJson) {
      return NextResponse.json(upstream.data, { status: upstream.status });
    }
  } catch (error) {
    console.error("payment webhook: backend unreachable", error);
  }

  return NextResponse.json({ detail: "Payment webhook unavailable" }, { status: 503 });
}
