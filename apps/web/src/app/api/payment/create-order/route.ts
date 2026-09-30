import { NextRequest, NextResponse } from "next/server";
import { backendUrl, ngrokHeaders } from "@/lib/upstream";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const PLAN_PRICES: Record<string, { monthly: number; yearly: number; name: string }> = {
  free: { monthly: 0, yearly: 0, name: "Free" },
  "100001": { monthly: 0, yearly: 0, name: "Free" },
  premium: { monthly: 99000, yearly: 990000, name: "Premium" },
  "100002": { monthly: 99000, yearly: 990000, name: "Premium" },
  vip: { monthly: 199000, yearly: 1990000, name: "VIP" },
  "100003": { monthly: 199000, yearly: 1990000, name: "VIP" },
};

function generatePayosSignature(data: Record<string, any>, checksumKey: string): string {
  const sortedKeys = Object.keys(data).sort();
  const signString = sortedKeys.map((k) => `${k}=${data[k]}`).join("&");
  return crypto.createHmac("sha256", checksumKey).update(signString).digest("hex");
}

/**
 * POST /api/payment/create-order
 * Tạo đơn hàng thanh toán PayOS / VietQR Ngân hàng.
 */
export async function POST(request: NextRequest) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const rawPlan = (body.plan_id || body.plan || "premium").toString().toLowerCase().trim();
  let planId = "premium";
  if (rawPlan.includes("vip") || rawPlan === "100003") {
    planId = "vip";
  } else if (rawPlan.includes("free") || rawPlan === "100001") {
    planId = "free";
  } else {
    planId = "premium";
  }

  const cycle = (body.cycle || "monthly").toLowerCase();
  const method = (body.method || "payos").toLowerCase();

  const authHeader = request.headers.get("authorization") || "";

  // 1. Thử gọi backend FastAPI trước
  try {
    const res = await fetch(`${backendUrl()}/api/payment/create-order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ngrokHeaders(),
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        plan_id: planId,
        cycle: cycle,
        method: method,
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.orderCode || data.success) {
        return NextResponse.json(data);
      }
    }
  } catch (backendError) {
    // Backend offline / Vercel standalone -> fallback to direct PayOS generation
  }

  // 2. Xử lý trực tiếp trên Vercel Serverless
  const planInfo = PLAN_PRICES[planId] || PLAN_PRICES.premium;
  const amount = cycle === "yearly" ? planInfo.yearly : planInfo.monthly;
  const orderCode = Math.floor(Date.now() / 1000) % 100000000;
  const description = `DEFEND ${orderCode}`;

  const payosClientId = process.env.PAYOS_CLIENT_ID || process.env.NEXT_PUBLIC_PAYOS_CLIENT_ID || "";
  const payosApiKey = process.env.PAYOS_API_KEY || process.env.NEXT_PUBLIC_PAYOS_API_KEY || "";
  const payosChecksumKey = process.env.PAYOS_CHECKSUM_KEY || process.env.NEXT_PUBLIC_PAYOS_CHECKSUM_KEY || "";

  const bankBin = process.env.PAYOS_BANK_BIN || "970422";
  const bankAccount = process.env.PAYOS_BANK_ACCOUNT || "040060104";
  const bankAccountName = process.env.PAYOS_BANK_ACCOUNT_NAME || "NGUYEN THE BAO";

  // Gọi PayOS API nếu có key
  if (payosClientId && payosApiKey && payosChecksumKey) {
    try {
      const returnUrl = `https://${request.headers.get("host") || "localhost:3000"}/payment-success?plan=${planId}&cycle=${cycle}&order_id=${orderCode}`;
      const cancelUrl = `https://${request.headers.get("host") || "localhost:3000"}/payment-cancel?plan=${planId}&cycle=${cycle}`;

      const payload = {
        amount,
        cancelUrl,
        description,
        orderCode,
        returnUrl,
      };

      const signature = generatePayosSignature(payload, payosChecksumKey);

      const payosRes = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
        method: "POST",
        headers: {
          "x-client-id": payosClientId,
          "x-api-key": payosApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          signature,
          items: [{ name: `Gói ${planInfo.name} (${cycle})`, quantity: 1, price: amount }],
        }),
      });

      const payosData = await payosRes.json();
      if (payosRes.ok && payosData.code === "00" && payosData.data) {
        const rawQr = payosData.data.qrCode || "";
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(
          rawQr
        )}`;

        return NextResponse.json({
          success: true,
          orderCode,
          amount,
          description,
          checkoutUrl: payosData.data.checkoutUrl,
          qrCode: rawQr,
          qrImageUrl,
          accountName: payosData.data.accountName || bankAccountName,
          accountNumber: payosData.data.accountNumber || bankAccount,
          bin: payosData.data.bin || bankBin,
          status: "PENDING",
          isSandbox: false,
          plan: { id: planId, name: planInfo.name, cycle },
        });
      }
    } catch (payosErr) {
      // Fall through to standard VietQR
    }
  }

  // VietQR format
  const qrImageUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(
    description
  )}&accountName=${encodeURIComponent(bankAccountName)}`;

  return NextResponse.json({
    success: true,
    orderCode,
    amount,
    description,
    checkoutUrl: `/checkout?orderCode=${orderCode}`,
    qrCode: "",
    qrImageUrl,
    accountName: bankAccountName,
    accountNumber: bankAccount,
    bin: bankBin,
    status: "PENDING",
    isSandbox: false,
    plan: { id: planId, name: planInfo.name, cycle },
  });
}
