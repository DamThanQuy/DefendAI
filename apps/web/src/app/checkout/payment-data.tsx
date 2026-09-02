export type PaymentMethodId =
  | "momo"
  | "zalopay"
  | "vnpay"
  | "bank_transfer"
  | "card";

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
    id: "momo",
    name: "Ví MoMo",
    description: "Thanh toán nhanh qua ví điện tử MoMo",
    logo: "M",
    badge: "Phổ biến",
    popular: true,
  },
  {
    id: "zalopay",
    name: "ZaloPay",
    description: "Quét QR hoặc liên kết ngân hàng qua ZaloPay",
    logo: "Z",
    popular: true,
  },
  {
    id: "vnpay",
    name: "VNPay",
    description: "Hỗ trợ tất cả ngân hàng nội địa Việt Nam",
    logo: "V",
  },
  {
    id: "bank_transfer",
    name: "Chuyển khoản ngân hàng",
    description: "Internet Banking / QR ngân hàng",
    logo: "🏦",
  },
  {
    id: "card",
    name: "Thẻ quốc tế",
    description: "Visa, Mastercard, JCB, Amex",
    logo: "💳",
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
  planId: "free" | "premium" | "vip";
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
  plan: { id: "free" | "premium" | "vip"; name: string; monthly: number; yearly: number },
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
