import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

export function Timer() {
  return (
    <Card className="w-fit">
      <CardContent className="p-4 flex items-center gap-3">
        <Clock className="h-5 w-5 text-primary" />
        <span className="text-2xl font-mono font-bold tracking-wider">14:59</span>
      </CardContent>
    </Card>
  );
}
