import { Sk, SkRows } from "@/components/ss/skeleton";

/**
 * Request Changes is its own two-pane shell (project rail + conversation), not
 * a PageShell, so the skeleton mirrors that instead of the standard header.
 */
export default function RequestsLoading() {
  return (
    <div role="status" aria-busy="true" className="flex h-full min-h-0 bg-ss-page">
      <span className="sr-only">Loading your change requests</span>

      <aside className="hidden w-[286px] shrink-0 flex-col border-r border-ss-line bg-white lg:flex">
        <div className="p-4">
          <Sk className="h-[42px] w-full rounded-ctl-lg" />
        </div>
        <div className="px-4">
          <Sk className="h-[11px] w-20" />
        </div>
        <div className="mt-3 px-4">
          <Sk className="h-[34px] w-full rounded-chip" />
        </div>
        <div className="mt-5 px-4">
          <Sk className="h-[11px] w-16" />
        </div>
        <div className="mt-3 flex flex-col gap-2.5 px-4">
          {[0, 1, 2].map((i) => (
            <Sk key={i} className="h-[62px] w-full rounded-chip" />
          ))}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex-none border-b border-ss-line bg-white px-6 py-4">
          <Sk className="h-[16px] w-40" />
          <Sk className="mt-2.5 h-[12px] w-32" />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-ss-page-alt">
          <SkRows rows={4} avatar={false} />
        </div>
        <div className="flex-none border-t border-ss-line bg-white px-6 py-4">
          <Sk className="h-[76px] w-full rounded-ctl-lg" />
        </div>
      </div>
    </div>
  );
}
