import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/payment/callback
 * Payment gateway callback (MoMo, ZaloPay, VNPay IPN/webhook).
 * This is the endpoint that payment gateways call to notify payment status.
 */
export async function GET(request: NextRequest) {
  return handleCallback(request);
}

export async function POST(request: NextRequest) {
  return handleCallback(request);
}

async function handleCallback(request: NextRequest) {
  try {
    // Forward the callback to backend for processing
    const searchParams = request.nextUrl.searchParams;
    const body = request.method === "POST" ? await request.json() : Object.fromEntries(searchParams);

    const res = await fetch(`${backendUrl()}/api/payment/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ngrokHeaders() },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    // Payment gateways usually expect specific response codes
    // MoMo: 0, VNPay: 00, ZaloPay: 0
    if (data.returnCode !== undefined) {
      return NextResponse.json(data);
    }
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { returnCode: -1, returnMessage: "Internal error" },
      { status: 500 }
    );
  }
}
