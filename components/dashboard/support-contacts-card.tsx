import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Phone, Clock } from "lucide-react";
import { SUPPORT_CONTACTS, SUPPORT_HOURS } from "@/lib/support-contacts";

/**
 * "Need help?" support card - the SpeedSettr team's contacts as tap-to-call
 * links plus the availability window. Shared by the dashboard home and the
 * feedback page so both stay in sync ([lib/support-contacts.ts] is the source
 * of truth). Presentational + server-safe (no client hooks).
 */
export function SupportContactsCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Need help?</CardTitle>
        <CardDescription>
          Reach the SpeedSettr team directly - tap to call or text.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {SUPPORT_CONTACTS.map((c) => (
          <div
            key={c.tel}
            className="flex items-center justify-between p-3 rounded-md border"
          >
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">@{c.name}</span>
            </div>
            <a
              href={`tel:${c.tel}`}
              className="text-sm font-medium text-primary tabular-nums hover:underline"
            >
              {c.phone}
            </a>
          </div>
        ))}
        <p className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          Available {SUPPORT_HOURS}
        </p>
      </CardContent>
    </Card>
  );
}
