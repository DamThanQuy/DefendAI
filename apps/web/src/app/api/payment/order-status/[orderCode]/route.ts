import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = "force-dynamic";

/**
 * GET /api/payment/order-status/[orderCode]
 * Kiểm tra trạng thái thanh toán từ backend.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orderCode: string } }
) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const orderCode = params.orderCode;

    const res = await fetch(`${backendUrl()}/api/payment/order-status/${orderCode}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: "Failed to check order status", message: error.message },
      { status: 500 }
    );
  }
}
