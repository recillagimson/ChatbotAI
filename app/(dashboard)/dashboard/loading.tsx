import {
  Sk,
  SkCard,
  SkCardHead,
  SkNavyPanel,
  SkPage,
  SkRows,
} from "@/components/ss/skeleton";

/** Overview: setup strip, the speed-to-lead hero, then the queue beside inventory. */
export default function DashboardLoading() {
  return (
    <SkPage label="Loading your overview" title="w-36" actions={1}>
      <Sk className="h-[54px] w-full rounded-panel" tone="on-page" />
      <SkNavyPanel height="h-[210px]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <SkCard className="p-0">
          <div className="p-[22px]">
            <SkCardHead />
          </div>
          <SkRows rows={3} />
        </SkCard>
        <SkCard className="p-0">
          <div className="p-[22px]">
            <SkCardHead width="w-32" />
          </div>
          <SkRows rows={2} avatar={false} />
        </SkCard>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <SkCard>
          <SkCardHead />
          <Sk className="mt-4 h-3 w-full rounded-full" />
          <div className="mt-4 flex flex-col gap-2.5">
            <Sk className="h-[12px] w-full" />
            <Sk className="h-[12px] w-full" />
            <Sk className="h-[12px] w-2/3" />
          </div>
        </SkCard>
        <SkCard>
          <SkCardHead width="w-28" />
          <Sk className="mt-4 h-[52px] w-full rounded-chip" />
          <Sk className="mt-2.5 h-[52px] w-full rounded-chip" />
        </SkCard>
      </div>
    </SkPage>
  );
}
