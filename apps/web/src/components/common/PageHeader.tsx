import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;
  className?: string;
}

export function PageHeader({
  title,
  description,
  backHref = "/",
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Quay lại
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">{title}</h1>
      {description && (
        <p className="text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
