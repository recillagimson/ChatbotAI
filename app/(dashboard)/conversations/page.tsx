import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { InboxList } from "@/components/dashboard/inbox-list";
import { inboxKey, readInboxFilters } from "@/lib/inbox-params";
import { SkInboxList } from "@/components/ss/skeleton";

export const dynamic = "force-dynamic";

/**
 * The inbox with nothing open.
 *
 * On desktop this is the list beside a "pick a thread" pane; on mobile it's just
 * the list, full width, and opening a thread replaces it. Same component, same
 * URL contract either way.
 */
export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const current = readInboxFilters(await searchParams);

  return (
    <div className="flex h-full min-h-0 bg-ss-page">
      {/* Keyed on the filter state: searching, switching tab, changing a filter
          or paging all rewrite the query string on THIS route, which never
          triggers loading.tsx. Without the key the list would sit on the old
          results with no sign anything was happening. */}
      <Suspense key={inboxKey(current)} fallback={<SkInboxList />}>
        <InboxList current={current} />
      </Suspense>

      <div className="hidden min-w-0 flex-1 items-center justify-center bg-ss-page-alt px-8 lg:flex">
        <div className="max-w-sm text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-card bg-ss-indigo-50">
            <MessagesSquare
              className="h-7 w-7 text-ss-indigo-600"
              aria-hidden="true"
            />
          </span>
          <p className="font-display text-[17px] font-bold leading-tight text-ss-ink">
            Pick a thread
          </p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ss-muted">
            Reading a conversation keeps your place in the list, so you can work
            the queue top to bottom without losing your filters.
          </p>
        </div>
      </div>
    </div>
  );
}
