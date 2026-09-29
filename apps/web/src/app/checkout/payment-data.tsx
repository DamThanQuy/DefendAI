export type PaymentMethodId =
  | "vietqr"
  | "payos"
  | "wallet"

export interface PaymentMethod {
  id: PaymentMethodId;
  name: string;
  description: string;
  logo: string; // emoji or short label as logo placeholder
  badge?: string;
  popular?: boolean;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "vietqr",
    name: "VietQR thủ công",
    description: "Quét QR chuyển khoản, admin đối soát",
    logo: "VQR",
  },
  {
    id: "payos",
    name: "PayOS",
    description: "Quét QR và tự động xác nhận giao dịch",
    logo: "P",
    badge: "Tự động",
    popular: true,
  },
  {
    id: "wallet",
    name: "Ví DefendAI",
    description: "Trừ trực tiếp số dư ví nội bộ của bạn",
    logo: "W",
  },
];

export const BANK_LIST = [
  { code: "VCB", name: "Vietcombank" },
  { code: "TCB", name: "Techcombank" },
  { code: "MB", name: "MB Bank" },
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
  const vat = 0; // MVP: chưa thu VAT
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
