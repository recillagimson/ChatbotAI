/**
 * The inbox, before the right pane arrives.
 *
 * The thread list lives in the layout and renders its own skeleton, so this only
 * covers the right pane (the "pick a thread" placeholder) - which carries no
 * data on desktop and is hidden on mobile.
 */
export default function ConversationsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="hidden min-w-0 flex-1 bg-ss-page-alt lg:block"
    >
      <span className="sr-only">Loading the inbox</span>
    </div>
  );
}
