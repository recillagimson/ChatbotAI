import { Sk, SkCard, SkCardHead } from "@/components/ss/skeleton";

/**
 * One change request under review. Mirrors the [id] page's chrome exactly: the
 * pinned header (back link, bot name, client email, status + dates) over a
 * centred reading column of stacked cards, so nothing shifts when it lands.
 */
export default function AdminRequestLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex h-full min-w-0 flex-col bg-ss-page"
    >
      <span className="sr-only">Loading this request</span>

      <header className="flex-none border-b border-ss-line bg-white px-5 pb-[18px] pt-[18px] sm:px-[30px]">
        <div className="flex flex-wrap items-start gap-x-3.5 gap-y-3">
          <Sk className="mt-1 h-[13px] w-24" tone="on-page" />
          <div className="min-w-0">
            <Sk className="h-[22px] w-56" tone="on-page" />
            <Sk className="mt-2 h-[13px] w-48" tone="on-page" />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            <Sk className="h-[20px] w-20 rounded-full" tone="on-page" />
            <Sk className="h-[12px] w-28" tone="on-page" />
            <Sk className="h-[12px] w-28" tone="on-page" />
          </div>
        </div>
      </header>

      <div className="ss-scroll flex flex-1 items-start justify-center overflow-auto px-5 pb-8 pt-6 sm:px-[30px]">
        <div className="flex w-full max-w-[768px] flex-col gap-5">
          {/* Reviewer reminder callout */}
          <Sk className="h-[62px] w-full rounded-panel" tone="on-page" />

          {/* Conversation */}
          <SkCard>
            <SkCardHead width="w-32" />
            <div className="mt-4 space-y-4">
              <div className="flex justify-start">
                <Sk className="h-[54px] w-[70%] rounded-ctl-lg" />
              </div>
              <div className="flex justify-end">
                <Sk className="h-[42px] w-[60%] rounded-ctl-lg" />
              </div>
            </div>
          </SkCard>

          {/* Client request */}
          <SkCard>
            <SkCardHead width="w-28" />
            <div className="mt-4 space-y-2.5">
              <Sk className="h-[12px] w-full" />
              <Sk className="h-[12px] w-full" />
              <Sk className="h-[12px] w-2/3" />
            </div>
          </SkCard>

          {/* Proposed section / prompt with diff + editable textarea */}
          <SkCard>
            <SkCardHead width="w-44" />
            <Sk className="mt-4 h-[120px] w-full rounded-ctl-lg" />
            <Sk className="mt-3.5 h-[220px] w-full rounded-ctl-lg" />
          </SkCard>

          {/* Actions */}
          <SkCard>
            <SkCardHead width="w-20" />
            <div className="mt-4 flex gap-3">
              <Sk className="h-[42px] w-28 rounded-ctl-lg" />
              <Sk className="h-[42px] w-24 rounded-ctl-lg" />
            </div>
          </SkCard>
        </div>
      </div>
    </div>
  );
}
