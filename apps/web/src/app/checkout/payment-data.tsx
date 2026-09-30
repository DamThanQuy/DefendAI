export type PaymentMethodId =
  | "payos"
  | "bank_transfer";

export interface PaymentMethod {
  id: PaymentMethodId;
  name: string;
  description: string;
  logo: string;
  badge?: string;
  popular?: boolean;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "payos",
    name: "Quét mã VietQR (Tất cả Ngân hàng)",
    description: "Quét mã QR tự động xác nhận qua PayOS / VietQR",
    logo: "QR",
    badge: "Tự động 24/7",
    popular: true,
  },
  {
    id: "bank_transfer",
    name: "Chuyển khoản thủ công",
    description: "Internet Banking / Chuyển khoản 24/7",
    logo: "🏦",
  },
];

export const BANK_LIST = [
  { code: "MB", name: "MB Bank" },
  { code: "VCB", name: "Vietcombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "ACB", name: "ACB" },
  { code: "BIDV", name: "BIDV" },
  { code: "VTB", name: "VietinBank" },
  { code: "TPB", name: "TPBank" },
  { code: "VPB", name: "VPBank" },
];

export interface OrderSummary {
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
  basePrice: number;
  discount: number;
  vat: number;
  total: number;
  startsAt: string;
  expiresAt: string;
}

export function formatVND(value: number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(value)) + "đ";
}

export function getOrderSummary(
  plan: { id: string; name: string; monthly: number; yearly: number },
  cycle: "monthly" | "yearly"
): OrderSummary {
  const basePrice = cycle === "monthly" ? plan.monthly : plan.yearly;
  // 17% discount for yearly
  const discount = cycle === "yearly" ? Math.round(basePrice * 0.17) : 0;
  const subtotal = basePrice - discount;
  const vat = 0;
  const total = subtotal + vat;
  const startsAt = new Date();
  const expiresAt = new Date(startsAt);
  if (cycle === "monthly") {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  } else {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  }
  return {
    planId: plan.id,
    planName: plan.name,
    cycle,
    basePrice,
    discount,
    vat,
    total,
    startsAt: startsAt.toLocaleDateString("vi-VN"),
    expiresAt: expiresAt.toLocaleDateString("vi-VN"),
  };
}
