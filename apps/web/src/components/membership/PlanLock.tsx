"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import type { PlanAccess } from "@/hooks/usePlanAccess";

/** Free hoặc gói đã hết hạn thì mời mua; đang có gói thấp hơn thì mời nâng cấp. */
export function UpgradeLink({ access, className = "" }: { access: PlanAccess | null; className?: string }) {
  return (
    <Link
      href="/pricing"
      data-testid="upgrade-link"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 ${className}`}
    >
      {access?.plan === "premium" ? "Nâng cấp gói" : "Mua gói"}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function expiredPlanNote(access: PlanAccess | null): string {
  return access?.expired_plan ? `Gói ${access.expired_plan} của bạn đã hết hạn. ` : "";
}

/** Làm mờ và chặn thao tác với phần bên trong, hiện lời mời mua hoặc nâng cấp gói ở giữa. */
export function PlanLock({
  locked,
  access,
  title,
  description,
  children,
}: {
  locked: boolean;
  access: PlanAccess | null;
  title: string;
  description: string;
  children: ReactNode;
}) {
  if (!locked) return <>{children}</>;

  return (
    <div className="relative" data-testid="plan-lock">
      {/* React 18 chỉ ghi thuộc tính inert khi giá trị là chuỗi, trong khi kiểu TS khai báo là boolean. */}
      <div className="pointer-events-none select-none opacity-40 grayscale" aria-hidden="true" {...({ inert: "" } as object)}>
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/95 p-6 text-center shadow-xl backdrop-blur-sm">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <h3 className="font-serif text-lg font-bold text-foreground">{title}</h3>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            {expiredPlanNote(access)}
            {description}
          </p>
          <UpgradeLink access={access} />
        </div>
      </div>
    </div>
  );
}
