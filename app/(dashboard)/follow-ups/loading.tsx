import { Sk, SkCard, SkPage, SkPills, SkNavyPanel } from "@/components/ss/skeleton";

/** Manual follow-ups: the window panel, four counters, view pills, the queue. */
export default function FollowUpsLoading() {
  return (
    <SkPage label="Loading the follow-up queue" title="w-52" actions={1}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SkNavyPanel height="h-[196px]" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-card border border-ss-line bg-white px-5 py-[18px]">
              <Sk className="h-[11px] w-20" />
              <Sk className="mt-3 h-[28px] w-14" />
              <Sk className="mt-2.5 h-[11px] w-24" />
            </div>
          ))}
        </div>
      </div>
      <SkPills count={3} />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <SkCard key={i} className="px-5 py-[18px]">
            <div className="flex items-start gap-3">
              <Sk className="h-[38px] w-[38px] shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Sk className="h-[14px] w-32" />
                  <Sk className="h-[18px] w-10 rounded-full" />
                  <Sk className="h-[18px] w-40 rounded-full" />
                </div>
                <Sk className="mt-2.5 h-[46px] w-full rounded-ctl-lg" />
                <Sk className="mt-2.5 h-[86px] w-full rounded-ctl-lg" />
              </div>
            </div>
            <div className="mt-3.5 flex gap-2 border-t border-ss-hair pt-3.5">
              <Sk className="h-[38px] w-32 rounded-ctl-lg" />
              <Sk className="h-[38px] w-28 rounded-ctl-lg" />
              <Sk className="h-[38px] w-36 rounded-ctl-lg" />
            </div>
          </SkCard>
        ))}
      </div>
    </SkPage>
  );
}
