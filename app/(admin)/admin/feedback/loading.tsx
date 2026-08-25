import { Sk, SkCard, SkPage, SkPills } from "@/components/ss/skeleton";

/**
 * The admin feedback inbox, loading. Same header strip, filter row and card
 * stack the resolved page renders, so nothing shifts when the data lands.
 */
export default function AdminFeedbackLoading() {
  return (
    <SkPage label="Loading feedback" title="w-32" actions={0}>
      <SkPills count={4} />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkCard key={i}>
            {/* Status badge, client, bot name, date */}
            <div className="flex flex-wrap items-center gap-2">
              <Sk className="h-[18px] w-16 rounded-full" />
              <Sk className="h-[13px] w-36" />
              <Sk className="h-[11px] w-20" />
              <Sk className="ml-auto h-[11px] w-16" />
            </div>
            {/* Message */}
            <Sk className="mt-3.5 h-[12px] w-full" />
            <Sk className="mt-2 h-[12px] w-3/4" />
            {/* Internal note */}
            <Sk className="mt-4 h-[11px] w-24" />
            <Sk className="mt-2 h-[58px] w-full rounded-ctl-lg" />
            {/* Actions */}
            <div className="mt-4 flex gap-2.5">
              <Sk className="h-[38px] w-28 rounded-ctl-lg" />
              <Sk className="h-[38px] w-28 rounded-ctl-lg" />
              <Sk className="h-[38px] w-24 rounded-ctl-lg" />
            </div>
          </SkCard>
        ))}
      </div>
    </SkPage>
  );
}
