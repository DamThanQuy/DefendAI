import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = "force-dynamic";

/**
 * GET /api/payment/order-status/[orderCode]
 * Kiểm tra trạng thái thanh toán từ backend FastAPI hoặc PayOS trực tiếp.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orderCode: string } }
) {
  const orderCode = params.orderCode;
  const authHeader = request.headers.get("authorization") || "";

  // 1. Thử gọi backend FastAPI trước
  try {
    const res = await fetch(`${backendUrl()}/api/payment/order-status/${orderCode}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (backendErr) {
    // Backend offline / Vercel standalone -> check PayOS directly
  }

  // 2. Check PayOS directly
  const payosClientId =
    process.env.PAYOS_CLIENT_ID ||
    process.env.NEXT_PUBLIC_PAYOS_CLIENT_ID ||
    "65689206-6aea-49b0-be71-3b489b5256e7";
  const payosApiKey =
    process.env.PAYOS_API_KEY ||
    process.env.NEXT_PUBLIC_PAYOS_API_KEY ||
    "71958fb8-5ee2-433b-a114-4c458427438f";

  if (payosClientId && payosApiKey) {
    try {
      const payosRes = await fetch(
        `https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`,
        {
          headers: {
            "x-client-id": payosClientId,
            "x-api-key": payosApiKey,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      const payosData = await payosRes.json();
      if (payosRes.ok && payosData.code === "00" && payosData.data) {
        if (payosData.data.status === "PAID") {
          return NextResponse.json({
            success: true,
            status: "PAID",
            orderCode,
            message: "Thanh toán thành công!",
          });
        }
      }
    } catch (e) {}
  }

  return NextResponse.json({
    success: true,
    status: "PENDING",
    orderCode,
    message: "Đang chờ thanh toán",
  });
}
