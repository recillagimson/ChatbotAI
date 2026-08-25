import { Sk, SkPage, SkCard, SkCardHead } from "@/components/ss/skeleton";

/** One client's admin detail - matches the PageShell + stat row + card sections. */
export default function AdminClientLoading() {
  return (
    <SkPage label="Loading this client" title="w-56" actions={2}>
      {/* Snapshot counters */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-card border border-ss-line bg-white px-5 py-[18px]"
          >
            <Sk className="h-[11px] w-24" />
            <Sk className="mt-3 h-[28px] w-16" />
          </div>
        ))}
      </div>

      {/* Access */}
      <div>
        <Sk className="h-[17px] w-20" tone="on-page" />
        <SkCard className="mt-3">
          <Sk className="h-[42px] w-full rounded-ctl-lg" />
          <Sk className="mt-3.5 h-[38px] w-36 rounded-ctl-lg" />
        </SkCard>
      </div>

      {/* Chatbots */}
      <div>
        <Sk className="h-[17px] w-32" tone="on-page" />
        <SkCard className="mt-3">
          <SkCardHead />
          <Sk className="mt-5 h-[46px] w-full rounded-ctl-lg" />
          <Sk className="mt-3.5 h-[120px] w-full rounded-ctl-lg" />
        </SkCard>
      </div>

      {/* Change requests */}
      <div>
        <Sk className="h-[17px] w-44" tone="on-page" />
        <SkCard className="mt-3 p-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={
                "flex items-start justify-between gap-4 p-4" +
                (i > 0 ? " border-t border-ss-hair" : "")
              }
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Sk className="h-[18px] w-16 rounded-full" />
                  <Sk className="h-[11px] w-16" />
                </div>
                <Sk className="mt-2.5 h-[12px] w-3/4" />
              </div>
              <Sk className="h-[32px] w-20 shrink-0 rounded-ctl-lg" />
            </div>
          ))}
        </SkCard>
      </div>
    </SkPage>
  );
}
