import {
  Sk,
  SkCard,
  SkCardHead,
  SkChart,
  SkPage,
  SkStatCards,
} from "@/components/ss/skeleton";

/** Statistics (7a): controls, metrics, activity, funnel + column, sequences. */
export default function StatisticsLoading() {
  return (
    <SkPage label="Loading statistics" title="w-32" actions={2}>
      <Sk className="h-[54px] w-full rounded-panel" tone="on-page" />
      <SkStatCards count={5} />
      <SkChart bars={26} />
      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <SkCard className="p-6">
          <SkCardHead />
          {/* The funnel's tapering stack, at its real insets. */}
          <div className="mt-5 flex flex-col gap-[9px]">
            <Sk className="h-[52px] w-full rounded-[12px]" />
            <div className="flex justify-center">
              <Sk className="h-[24px] w-16 rounded-full" />
            </div>
            <div className="pl-10 pr-[26px]">
              <Sk className="h-[52px] w-full rounded-[12px]" />
            </div>
            <div className="flex justify-center">
              <Sk className="h-[24px] w-16 rounded-full" />
            </div>
            <div className="pl-[74px] pr-[52px]">
              <Sk className="h-[52px] w-full rounded-[12px]" />
            </div>
            <div className="flex justify-center">
              <Sk className="h-[24px] w-16 rounded-full" />
            </div>
            <div className="pl-[108px] pr-[78px]">
              <Sk className="h-[52px] w-full rounded-[12px]" />
            </div>
          </div>
        </SkCard>
        <div className="flex flex-col gap-[18px]">
          {[0, 1].map((i) => (
            <SkCard key={i}>
              <Sk className="h-[15px] w-32" />
              <Sk className="mt-4 h-3 w-full rounded-full" />
              <div className="mt-4 flex flex-col gap-2.5">
                <Sk className="h-[12px] w-full" />
                <Sk className="h-[12px] w-full" />
                <Sk className="h-[12px] w-3/4" />
              </div>
            </SkCard>
          ))}
          <SkCard>
            <Sk className="h-[15px] w-40" />
            <Sk className="mt-3 h-[12px] w-full" />
            <Sk className="mt-3.5 h-[38px] w-36 rounded-ctl-lg" />
          </SkCard>
        </div>
      </div>
      <SkCard className="p-6">
        <SkCardHead width="w-48" />
        <div className="mt-5 grid gap-[22px] lg:grid-cols-2">
          {[0, 1].map((col) => (
            <div key={col}>
              <Sk className="h-[14px] w-40" />
              <div className="mt-3 flex flex-col gap-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-panel border border-ss-line px-[17px] py-[15px]">
                    <div className="flex items-baseline gap-2.5">
                      <Sk className="h-[11px] w-14" />
                      <Sk className="ml-auto h-[26px] w-16" />
                    </div>
                    <Sk className="mt-3 h-[30px] w-full rounded-[9px]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SkCard>
    </SkPage>
  );
}
