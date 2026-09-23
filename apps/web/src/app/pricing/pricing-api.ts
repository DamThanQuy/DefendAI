import type { Plan } from "./pricing-data";

export async function fetchPlans(): Promise<Plan[]> {
  const response = await fetch("/api/subscriptions", { cache: "no-store" });
  if (!response.ok) throw new Error("Không tải được bảng giá");
  const data = await response.json();
  return (data.plans || []).map((plan: {
    id: number;
    slug: string;
    name: string;
    tagline: string;
    icon: Plan["icon"];
    price: number;
    featured?: boolean;
    special?: boolean;
    features?: Plan["features"];
  }) => ({
    id: plan.slug,
    name: plan.name,
    tagline: plan.tagline,
    icon: plan.icon,
    monthly: plan.price,
    yearly: plan.price,
    featured: plan.featured,
    special: plan.special,
    features: plan.features || [],
    cta: plan.price === 0 ? "Bắt đầu miễn phí" : "Đăng ký ngay",
  }));
}
