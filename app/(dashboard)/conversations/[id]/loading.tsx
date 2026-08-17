import { Sk } from "@/components/ss/skeleton";

/**
 * A thread opening in the right pane.
 *
 * Only the conversation pane is drawn - the thread list lives in the layout and
 * stays mounted while this loads, which is the whole point of the two-pane
 * inbox. Bubbles alternate sides and vary in width, because a column of
 * identical blocks reads as a table rather than a conversation.
 */
const BUBBLES = [
  { mine: false, w: "w-[42%]" },
  { mine: true, w: "w-[56%]" },
  { mine: false, w: "w-[34%]" },
  { mine: true, w: "w-[48%]" },
  { mine: false, w: "w-[50%]" },
];

export default function ConversationLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-ss-page-alt"
    >
      <span className="sr-only">Loading the conversation</span>

      <div className="flex-none border-b border-ss-line bg-white px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Sk className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0">
            <Sk className="h-[17px] w-40" />
            <Sk className="mt-2.5 h-[12px] w-56" />
          </div>
          <Sk className="ml-auto h-[34px] w-36 rounded-ctl-lg" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-6 sm:px-6">
        {BUBBLES.map((b, i) => (
          <Sk
            key={i}
            className={`h-[52px] rounded-card ${b.w} ${b.mine ? "self-end" : "self-start"}`}
          />
        ))}
      </div>

      <div className="flex-none border-t border-ss-line bg-white px-5 py-4 sm:px-6">
        <Sk className="h-[76px] w-full rounded-ctl-lg" />
      </div>
    </div>
  );
}
