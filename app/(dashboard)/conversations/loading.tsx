import { SkInboxList } from "@/components/ss/skeleton";

/**
 * The inbox, before the list arrives.
 *
 * Only the left pane is drawn. The right pane is the "pick a thread" empty
 * state, which carries no data - showing a placeholder there would promise
 * content that never comes.
 */
export default function ConversationsLoading() {
  return (
    <div role="status" aria-busy="true" className="flex h-full bg-ss-page">
      <span className="sr-only">Loading the inbox</span>
      <SkInboxList />
      <div className="hidden min-w-0 flex-1 lg:block" />
    </div>
  );
}
