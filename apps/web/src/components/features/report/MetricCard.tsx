import type { Metric } from "@/types";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

interface MetricCardProps {
  metric: Metric;
}

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{metric.label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{metric.value}</p>
      </CardContent>
    </Card>
  );
}
