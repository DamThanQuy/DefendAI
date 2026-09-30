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
  try {
    const authHeader = request.headers.get("authorization") || "";
    const orderCode = params.orderCode;

    const res = await fetch(`${backendUrl()}/api/payment/mock-confirm/${orderCode}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: "Failed to confirm payment", message: error.message },
      { status: 500 }
    );
  }
}
