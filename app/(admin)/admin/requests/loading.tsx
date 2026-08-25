import { Sk, SkCard, SkPage, SkPills } from "@/components/ss/skeleton";

/** The admin change-request queue - PageShell header + pill row + card rows. */
export default function AdminRequestsLoading() {
  return (
    <SkPage label="Loading change requests" title="w-52" actions={0}>
      <SkPills count={5} />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkCard key={i} className="px-5 py-4">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Sk className="h-[18px] w-20 rounded-full" />
                  <Sk className="h-[13px] w-40" />
                  <Sk className="h-[18px] w-28 rounded-[5px]" />
                  <Sk className="h-[11px] w-16" />
                </div>
                <Sk className="mt-2.5 h-[12px] w-full" />
                <Sk className="mt-2 h-[12px] w-2/3" />
              </div>
              <Sk className="h-[34px] w-20 shrink-0 rounded-ctl-lg" />
            </div>
          </SkCard>
        ))}
      </div>
    </SkPage>
  );
}
