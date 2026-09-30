import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";

export const dynamic = "force-dynamic";

/**
 * GET /api/payment/order-status/[orderCode]
 * Kiểm tra trạng thái thanh toán từ backend FastAPI hoặc PayOS trực tiếp.
 *
 * Strategy: Query PayOS directly IN PARALLEL with the backend.
 * PayOS is the source of truth for payment status. On Vercel (no backend),
 * we no longer waste 3.5s on an unreachable backend before falling back.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { orderCode: string } }
) {
  const orderCode = params.orderCode;
  const authHeader = request.headers.get("authorization") || "";

  const payosClientId =
    process.env.PAYOS_CLIENT_ID ||
    process.env.NEXT_PUBLIC_PAYOS_CLIENT_ID ||
    "";
  const payosApiKey =
    process.env.PAYOS_API_KEY ||
    process.env.NEXT_PUBLIC_PAYOS_API_KEY ||
    "";

  // --- Run backend + PayOS checks in parallel ---
  const backendPromise = fetchBackendStatus(orderCode, authHeader);
  const payosPromise = payosClientId && payosApiKey
    ? fetchPayOSStatus(orderCode, payosClientId, payosApiKey)
    : Promise.resolve(null);

  const [backendResult, payosResult] = await Promise.allSettled([
    backendPromise,
    payosPromise,
  ]);

  // --- Determine final status ---
  const backendData =
    backendResult.status === "fulfilled" ? backendResult.value : null;
  const payosData =
    payosResult.status === "fulfilled" ? payosResult.value : null;

  // Priority: if EITHER source says PAID, return PAID.
  // Prefer backend's PAID response (it also writes DB subscription).
  // If backend says PENDING but PayOS says PAID → trust PayOS (source of truth).
  if (backendData && backendData.status === "PAID") {
    return NextResponse.json(backendData);
  }
  if (payosData && payosData.status === "PAID") {
    return NextResponse.json(payosData);
  }

  // Return non-PENDING statuses from PayOS (CANCELLED, EXPIRED, etc.)
  if (payosData && payosData.status !== "PENDING") {
    return NextResponse.json(payosData);
  }

  // Return backend data if available (even if PENDING)
  if (backendData) {
    return NextResponse.json(backendData);
  }

  // 3. Fallback: still pending
  return NextResponse.json({
    success: true,
    status: "PENDING",
    orderCode,
    message: "Đang chờ thanh toán",
  });
}

/**
 * Check payment status from FastAPI backend.
 * Short timeout (1.5s) to avoid blocking on Vercel where no backend exists.
 */
async function fetchBackendStatus(
  orderCode: string,
  authHeader: string
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `${backendUrl()}/api/payment/order-status/${orderCode}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...ngrokHeaders(),
          ...(authHeader ? { Authorization: authHeader } : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      }
    );

    if (res.ok) {
      const data = await res.json();
      // Only return if the backend gave a meaningful answer
      if (data && (data.status === "PAID" || data.status === "PENDING")) {
        return data;
      }
    }
  } catch {
    // Backend offline / timeout — expected on Vercel standalone
  }
  return null;
}

/**
 * Check payment status directly from PayOS API.
 * This is the source of truth for whether the bank transfer landed.
 */
async function fetchPayOSStatus(
  orderCode: string,
  clientId: string,
  apiKey: string
): Promise<Record<string, unknown> | null> {
  try {
    const payosRes = await fetch(
      `https://api-merchant.payos.vn/v2/payment-requests/${orderCode}`,
      {
        headers: {
          "x-client-id": clientId,
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      }
    );

    const payosData = await payosRes.json();

    if (payosRes.ok && payosData.code === "00" && payosData.data) {
      const status = payosData.data.status;
      if (status === "PAID") {
        return {
          success: true,
          status: "PAID",
          orderCode,
          message: "Thanh toán thành công!",
          amount: payosData.data.amount,
          paidAt: payosData.data.transactionDateTime || null,
        };
      }
      // Return PayOS status even if not PAID (e.g. CANCELLED, EXPIRED)
      return {
        success: true,
        status: status,
        orderCode,
        message:
          status === "CANCELLED"
            ? "Đơn hàng đã bị hủy"
            : status === "EXPIRED"
            ? "Đơn hàng đã hết hạn"
            : "Đang chờ thanh toán",
      };
    }
  } catch {
    // PayOS unreachable — fall through
  }
  return null;
}

