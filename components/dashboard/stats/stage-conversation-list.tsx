import Link from "next/link";
import { Users } from "lucide-react";
import type { StageConversation } from "@/lib/analytics";

interface StageConversationListProps {
  rows: StageConversation[];
  total: number;
  shown: number;
  loadMoreHref: string | null;
  emptyLabel?: string;
}

/** Short display label for a conversation contact */
function contactLabel(row: StageConversation): string {
  if (row.contact_name) return row.contact_name;
  if (row.contact_username) return `@${row.contact_username}`;
  return "Unknown";
}

/** Format ISO date string to a readable local date */
function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Expandable list of conversations within a funnel stage.
 * Fully server-rendered — pagination via Link href.
 */
export function StageConversationList({
  rows,
  total,
  shown,
  loadMoreHref,
  emptyLabel = "No conversations in this stage yet.",
}: StageConversationListProps) {
  if (rows.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-dashed border-border/50 px-4 py-4 text-sm text-muted-foreground">
        <Users className="mb-1 h-4 w-4 opacity-50 inline-block mr-1.5" aria-hidden="true" />
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-border/40 bg-background/60 overflow-hidden">
      <ul role="list" className="divide-y divide-border/30">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors"
          >
            {/* Left: name + meta */}
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate leading-snug">
                {contactLabel(row)}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                {row.contact_username ? (
                  <span className="mr-2">@{row.contact_username}</span>
                ) : null}
                <span className="opacity-60">{row.id.slice(0, 8)}</span>
              </p>
            </div>

            {/* Right: date */}
            <time
              dateTime={row.created_at}
              className="text-xs text-muted-foreground tabular-nums shrink-0"
            >
              {shortDate(row.created_at)}
            </time>
          </li>
        ))}
      </ul>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/20">
        <p className="text-xs text-muted-foreground tabular-nums">
          Showing <span className="font-medium text-foreground">{shown}</span> of{" "}
          <span className="font-medium text-foreground">{total}</span>
        </p>

        {shown < total && loadMoreHref ? (
          <Link
            href={loadMoreHref}
            className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded inline-flex items-center h-11 px-2"
          >
            Load more
          </Link>
        ) : null}
      </div>
    </div>
  );
}
