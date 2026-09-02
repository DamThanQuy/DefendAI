import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/payment/create-order
 * Tạo đơn hàng thanh toán member (proxy sang backend).
 * Body: { plan: "premium" | "vip", cycle: "monthly" | "yearly", method: "momo" | ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const authHeader = request.headers.get("authorization") || "";

    const res = await fetch(`${BACKEND}/api/payment/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: "Failed to create order", message: error.message },
      { status: 500 }
    );
  }
}
