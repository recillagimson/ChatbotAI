import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";

type EventRow = {
  id: string;
  event_type: string;
  tokens_used: number | null;
  created_at: string;
  chatbots: { name: string } | null;
};

const DESTRUCTIVE_TYPES = new Set([
  "push_failed",
  "no_manychat_api_key",
  "manychat_key_decrypt_failed",
]);

function eventVariant(event_type: string): BadgeProps["variant"] {
  if (event_type === "ai_reply") return "default";
  if (event_type === "kb_retrieval") return "secondary";
  if (DESTRUCTIVE_TYPES.has(event_type)) return "destructive";
  return "outline";
}

function humanizeEventType(event_type: string): string {
  switch (event_type) {
    case "ai_reply":
      return "AI reply";
    case "kb_retrieval":
      return "KB retrieval";
    case "push_failed":
      return "Push failed";
    case "no_manychat_api_key":
      return "No ManyChat key";
    case "manychat_key_decrypt_failed":
      return "Key decrypt failed";
    default:
      // Convert snake_case to Title Case
      return event_type
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

export function EventsList({ events }: { events: EventRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No events in this range yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 text-left font-medium">Event</th>
                  <th className="pb-2 pr-4 text-left font-medium">Chatbot</th>
                  <th className="pb-2 pr-4 text-right font-medium tabular-nums">
                    Tokens
                  </th>
                  <th className="pb-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((ev) => (
                  <tr key={ev.id} className="align-middle">
                    <td className="py-2 pr-4">
                      <Badge variant={eventVariant(ev.event_type)}>
                        {humanizeEventType(ev.event_type)}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {ev.chatbots?.name ?? "-"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                      {ev.tokens_used !== null && ev.tokens_used > 0
                        ? ev.tokens_used.toLocaleString()
                        : "-"}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      <time dateTime={ev.created_at}>
                        {new Date(ev.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
