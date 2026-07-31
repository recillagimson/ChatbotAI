import { Sk, SkCard, SkPage } from "@/components/ss/skeleton";

/** Billing: the three-question strip, then the plan card beside the yearly panel. */
export default function BillingLoading() {
  return (
    <SkPage label="Loading billing" title="w-24" actions={0}>
      <div className="mx-auto flex w-full max-w-[62rem] flex-col gap-5">
        <SkCard className="grid gap-0 p-0 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`px-[22px] py-5 ${i > 0 ? "border-t border-ss-hair md:border-l md:border-t-0" : ""}`}
            >
              <Sk className="h-[11px] w-24" />
              <Sk className="mt-3 h-[18px] w-32" />
              <Sk className="mt-2.5 h-[11px] w-36" />
            </div>
          ))}
        </SkCard>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <SkCard className="p-6">
            <div className="flex items-center gap-3">
              <Sk className="h-[38px] w-[38px] shrink-0 rounded-ctl-lg" />
              <div className="min-w-0 flex-1">
                <Sk className="h-[16px] w-32" />
                <Sk className="mt-2.5 h-[12px] w-48" />
              </div>
              <Sk className="h-[28px] w-20" />
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <Sk key={i} className="h-[74px] rounded-chip" />
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Sk key={i} className="h-[12px] w-full" />
              ))}
            </div>
            <Sk className="mt-6 h-[46px] w-full rounded-ctl-lg" />
          </SkCard>

          <div className="flex flex-col gap-5">
            <div className="rounded-card bg-ss-navy px-[22px] py-5">
              <Sk className="h-[11px] w-32" tone="on-navy" />
              <Sk className="mt-3.5 h-[32px] w-28" tone="on-navy" />
              <Sk className="mt-3 h-[12px] w-full" tone="on-navy" />
              <Sk className="mt-3.5 h-[62px] w-full rounded-chip" tone="on-navy" />
              <Sk className="mt-4 h-[42px] w-full rounded-ctl-lg" tone="on-navy" />
            </div>
            <SkCard>
              <Sk className="h-[15px] w-20" />
              <Sk className="mt-3.5 h-[12px] w-24" />
              <Sk className="mt-2.5 h-[12px] w-40" />
            </SkCard>
          </div>
        </div>
      </div>
    </SkPage>
  );
}
