import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders, readUpstream } from "@/lib/upstream";

export const dynamic = "force-dynamic";
// Backend còn phải gọi PayOS (tối đa 10 giây) trước khi trả về.
export const maxDuration = 30;

const BACKEND_TIMEOUT_MS = 25_000;

function unavailable(status: number) {
  return NextResponse.json(
    { detail: "Không kết nối được máy chủ thanh toán. Vui lòng thử lại sau." },
    { status }
  );
}

/**
 * POST /api/payment/create-order
 * Chỉ chuyển tiếp sang backend: giá lấy từ bảng subscription_plans và đơn được lưu ở đó.
 * Backend lỗi thì báo lỗi, không tự tạo link thanh toán: đơn như vậy backend không biết
 * nên khách trả tiền mà không được kích hoạt gói.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  // Backend hiện chưa nhận đơn nạp ví: không để rơi thành đơn mua gói.
  if (body.purpose === "wallet") {
    return NextResponse.json({ detail: "Chức năng nạp ví đang tạm ngưng." }, { status: 400 });
  }
  if (!body.plan_id) {
    return NextResponse.json({ detail: "Thiếu mã gói cần thanh toán." }, { status: 422 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const origin = request.headers.get("origin") || request.nextUrl.origin;

  try {
    const res = await fetch(`${backendUrl()}/api/payment/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        plan_id: body.plan_id,
        cycle: body.cycle || "monthly",
        method: body.method || "payos",
        return_url: `${origin}/payment-success`,
        cancel_url: `${origin}/payment-cancel`,
      }),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });

    const upstream = await readUpstream(res);
    if (upstream.nonJson) {
      console.error("create-order: backend returned non-JSON", upstream.status, upstream.snippet);
      return unavailable(502);
    }
    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (error) {
    console.error("create-order: backend unreachable", error);
    return unavailable(503);
  }
}
