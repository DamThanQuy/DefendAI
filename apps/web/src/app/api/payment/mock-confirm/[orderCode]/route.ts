import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = "force-dynamic";

/**
 * POST /api/payment/mock-confirm/[orderCode]
 * Xác nhận thanh toán thành công (Sandbox / Demo).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { orderCode: string } }
) {
  const authHeader = request.headers.get("authorization") || "";
  const orderCode = params.orderCode;

  // 1. Try backend FastAPI first
  try {
    const res = await fetch(`${backendUrl()}/api/payment/mock-confirm/${orderCode}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      signal: AbortSignal.timeout(1500),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (error: any) {
    // Backend offline / Vercel standalone -> fallback to standalone confirmation
  }

  // 2. Standalone verification / confirmation
  return NextResponse.json({
    success: true,
    status: "PAID",
    orderCode: parseInt(orderCode, 10) || orderCode,
    message: "Xác nhận thanh toán thành công!",
  });
}
