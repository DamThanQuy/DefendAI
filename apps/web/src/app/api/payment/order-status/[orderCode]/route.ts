import { NextRequest, NextResponse } from "next/server";
import { authOnlyHeaders, backendUrl, readUpstream } from "@/lib/upstream";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: { orderCode: string } }
) {
  const orderCode = encodeURIComponent(params.orderCode);
  try {
    // FastAPI first reconciles with PayOS, then commits the order and the subscription.
    const response = await fetch(`${backendUrl()}/api/payment/order-status/${orderCode}`, {
      headers: authOnlyHeaders(request),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const upstream = await readUpstream(response);
    if (!upstream.nonJson) {
      return NextResponse.json(upstream.data, { status: upstream.status });
    }
  } catch (error) {
    console.error("payment order-status: backend unreachable", error);
  }

  return NextResponse.json(
    { detail: "Chưa thể kiểm tra giao dịch. Vui lòng thử lại sau." },
    { status: 503 }
  );
}
