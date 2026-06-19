import { Badge } from "@/components/ui/badge";
import type { ChangeRequest } from "@/lib/types";

type BadgeVariant = "secondary" | "warning" | "success" | "destructive";

const STATUS_MAP: Record<
  ChangeRequest["status"],
  { variant: BadgeVariant; label: string }
> = {
  draft: { variant: "secondary", label: "Draft" },
  pending: { variant: "secondary", label: "Pending review" },
  approved: { variant: "warning", label: "Approved (not live yet)" },
  applied: { variant: "success", label: "Applied" },
  rejected: { variant: "destructive", label: "Rejected" },
};

export function ChangeRequestHistory({
  requests,
}: {
  requests: ChangeRequest[];
}) {
  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No change requests yet.</p>
    );
  }

  return (
    <ul className="space-y-4">
      {requests.map((req) => {
        const status = STATUS_MAP[req.status] ?? STATUS_MAP.pending;
        return (
          <li key={req.id} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Badge variant={status.variant}>{status.label}</Badge>
              <time
                dateTime={req.created_at}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {new Date(req.created_at).toLocaleDateString()}
              </time>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words line-clamp-3">
              {req.request_text}
            </p>
            {req.proposed?.summary && (
              <p className="text-xs text-muted-foreground">
                AI draft: {req.proposed.summary}
              </p>
            )}
            {req.draft_error && (
              <p className="text-xs text-amber-700">
                Draft pending — the team will generate it.
              </p>
            )}
            {req.admin_note &&
              (req.status === "rejected" || req.status === "applied") && (
                <p className="text-xs text-muted-foreground">
                  Team note: {req.admin_note}
                </p>
              )}
          </li>
        );
      })}
    </ul>
  );
}
