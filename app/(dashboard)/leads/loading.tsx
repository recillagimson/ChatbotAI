import { Sk, SkCard, SkPage, SkPills } from "@/components/ss/skeleton";

/** Lead contacts: status pills, then one card per lead. */
export default function LeadsLoading() {
  return (
    <SkPage label="Loading lead contacts" title="w-44" actions={0}>
      <SkPills count={5} />
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <SkCard key={i} className="px-5 py-[18px]">
            <div className="flex flex-wrap items-center gap-3">
              <Sk className="h-[14px] w-36" />
              <Sk className="h-[18px] w-24 rounded-full" />
              <Sk className="ml-auto h-9 w-32" />
            </div>
            <Sk className="mt-3 h-[12px] w-64" />
          </SkCard>
        ))}
      </div>
    </SkPage>
  );
}
