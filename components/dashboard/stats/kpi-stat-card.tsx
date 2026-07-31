import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const toneClasses: Record<string, string> = {
  good: "text-conv-good",
  mid: "text-conv-mid",
  bad: "text-conv-bad",
  muted: "text-muted-foreground",
  default: "",
};

export function KpiStatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  stub = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "good" | "mid" | "bad" | "muted";
  stub?: boolean;
}) {
  const valueTone = stub ? "text-muted-foreground" : toneClasses[tone];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {Icon && (
          <Icon
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-display font-semibold tabular-nums",
            valueTone
          )}
        >
          {stub ? <span className="opacity-40">-</span> : value}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {sub && (
            <p className="text-xs text-muted-foreground">{sub}</p>
          )}
          {stub && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-sm">
              not tracked yet
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
