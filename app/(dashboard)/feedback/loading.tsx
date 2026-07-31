import { Sk, SkCard, SkPage } from "@/components/ss/skeleton";

/** Feedback: the form, with the contact card beside it. */
export default function FeedbackLoading() {
  return (
    <SkPage label="Loading feedback" title="w-28" actions={0}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <SkCard className="p-6">
          <Sk className="h-[12px] w-32" />
          <Sk className="mt-2.5 h-[42px] w-full rounded-ctl-lg" />
          <Sk className="mt-5 h-[12px] w-24" />
          <Sk className="mt-2.5 h-[140px] w-full rounded-ctl-lg" />
          <Sk className="mt-5 h-[12px] w-36" />
          <Sk className="mt-2.5 h-[42px] w-full rounded-ctl-lg" />
          <Sk className="mt-5 h-[40px] w-36 rounded-ctl-lg" />
        </SkCard>
        <div className="flex flex-col gap-5">
          <div className="rounded-card bg-ss-navy px-[22px] py-5">
            <Sk className="h-[15px] w-32" tone="on-navy" />
            <Sk className="mt-2.5 h-[12px] w-48" tone="on-navy" />
            <Sk className="mt-4 h-[46px] w-full rounded-chip" tone="on-navy" />
            <Sk className="mt-2.5 h-[46px] w-full rounded-chip" tone="on-navy" />
          </div>
          <SkCard>
            <Sk className="h-[15px] w-28" />
            <Sk className="mt-3.5 h-[12px] w-32" />
          </SkCard>
        </div>
      </div>
    </SkPage>
  );
}
