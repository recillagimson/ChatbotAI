import { MessagesSquare } from "lucide-react";

/**
 * The inbox with nothing open - just the "pick a thread" pane.
 *
 * The thread list lives in the conversations LAYOUT now, so this page is only
 * the right pane: opening a thread swaps this out for the conversation without
 * touching the list. On mobile this pane is hidden and the layout's list fills
 * the screen; on desktop it sits beside the list.
 */
export default function ConversationsPage() {
  return (
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
  );
}
