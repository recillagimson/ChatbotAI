import { Sk, SkCard, SkPage, SkPills } from "@/components/ss/skeleton";

/** Learn: the computed "start here" path, then the lesson library. */
export default function LearnLoading() {
  return (
    <SkPage label="Loading lessons" title="w-24" actions={1}>
      <div className="grid overflow-hidden rounded-card bg-ss-navy xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="px-7 py-6">
          <Sk className="h-[11px] w-40" tone="on-navy" />
          <Sk className="mt-3.5 h-[30px] w-72" tone="on-navy" />
          <Sk className="mt-3 h-[12px] w-full max-w-[24rem]" tone="on-navy" />
          <Sk className="mt-5 h-[40px] w-36 rounded-ctl-lg" tone="on-navy" />
        </div>
        <div className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Sk key={i} className="h-[58px] w-full rounded-chip" tone="on-navy" />
          ))}
        </div>
      </div>

      <SkPills count={5} />

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-card border border-ss-line bg-white">
            <Sk className="h-[112px] w-full rounded-none" />
            <div className="px-[18px] py-4">
              <Sk className="h-[14px] w-48" />
              <Sk className="mt-2.5 h-[12px] w-full" />
              <Sk className="mt-2 h-[12px] w-3/4" />
              <div className="mt-4 flex items-center gap-2 border-t border-ss-hair pt-3">
                <Sk className="h-[18px] w-32 rounded-full" />
                <Sk className="ml-auto h-[12px] w-10" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </SkPage>
  );
}
