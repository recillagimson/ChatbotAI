import { Suspense } from "react";
import { InboxListClient } from "@/components/dashboard/inbox-list-client";
import { SkInboxList } from "@/components/ss/skeleton";

/**
 * The two-pane inbox shell.
 *
 * The thread list lives HERE, not in the pages, so it stays mounted while the
 * right pane ({children}) swaps between "pick a thread" (/conversations) and an
 * open conversation (/conversations/[id]). Opening a thread is a path change
 * only - the layout is shared across both routes, so React keeps this list
 * instance (and its scroll) and just re-renders the child. The list is a client
 * component that reads the URL, so filtering still works and the Suspense
 * boundary satisfies useSearchParams.
 */
export default function ConversationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 bg-ss-page">
      <Suspense fallback={<SkInboxList />}>
        <InboxListClient />
      </Suspense>
      {children}
    </div>
  );
}
